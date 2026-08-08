const express = require("express");
const cors = require("cors");
require("dotenv").config();

const cloudinary = require("cloudinary").v2;

const parseTelegram = require("./tasks/parseTelegram");

const multer = require("multer");
const path = require("path");
const fs = require("fs");

const pool = require("./db");

const app = express();

app.set("trust proxy", 1);

app.use(cors());
app.use(express.json());

const rateLimit = require("express-rate-limit");

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

async function sendTelegram(message) {

    try {

        await fetch(
            `https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`,
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({

                    chat_id: process.env.TELEGRAM_CHAT_ID,

                    text: message

                })

            }
        );

    } catch(error) {

        console.error(
            "Ошибка Telegram:",
            error
        );

    }

}

console.log("Сервер запущен");


function adminAuth(req, res, next) {

    const key = req.headers["x-admin-key"];

    if (key !== process.env.ADMIN_KEY) {

        return res.status(403).json({
            error: "Нет доступа"
        });

    }

    next();
}

app.use("/uploads", express.static("uploads"));

const PORT = process.env.PORT || 3000;

const storage = multer.memoryStorage();


const upload = multer({

    storage,

    limits: {

        fileSize: 5 * 1024 * 1024

    }

});

async function savePhotos(files, problemId) {

    if (!files || files.length === 0) {
        return [];
    }

    const paths = [];

    for (let i = 0; i < files.length; i++) {

        const file = files[i];

        const result = await cloudinary.uploader.upload(
            `data:${file.mimetype};base64,${file.buffer.toString("base64")}`,
            {
                folder: `kaspiysk-map/${problemId}`
            }
        );

        paths.push(result.secure_url);

    }

    return paths;

}

// Проверка работы сервера
app.get("/", (req, res) => {
    res.send("Kaspiysk Map API работает!");
});


// Проверка подключения к базе
app.get("/db-test", async (req, res) => {
    try {
        const result = await pool.query("SELECT NOW()");
        res.json(result.rows);
    } catch (error) {

        console.error(error);
        res.status(500).json({
            error: error.message
        });

    }
});


// Получение всех проблемных участков
app.get("/problems", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                id,
                type,
                description,
                status,
                priority,
                address,
                landmark,
                ST_X(location) AS longitude,
                ST_Y(location) AS latitude,
                created_at,
                resolved_at,
                resolution_comment
            FROM public.problems
        `);

        res.json(result.rows);

    } catch (error) {
        console.error(error);
        res.status(500).send("Ошибка получения проблем");
    }
});

// Активные проблемы
app.get("/problems/active", async (req, res) => {
    try {

        const result = await pool.query(`
            SELECT 
                p.id,
                p.type,
                p.description,
                p.status,
                p.priority,
                p.address,
                p.landmark,
                ST_X(p.location) AS longitude,
                ST_Y(p.location) AS latitude,
                p.created_at,
                p.resolved_at,
                p.resolution_comment,

                COALESCE(
                    json_agg(ph.photo_path) 
                    FILTER (
                        WHERE ph.id IS NOT NULL
                    ),
                    '[]'
                ) AS photos

            FROM public.problems p

            LEFT JOIN public.problem_photos ph
            ON p.id = ph.problem_id

            WHERE p.status != 'done'

            GROUP BY p.id

            ORDER BY
                CASE p.priority
                    WHEN 'high' THEN 1
                    WHEN 'medium' THEN 2
                    WHEN 'low' THEN 3
                END,
                p.created_at ASC
        `);

        for (const problem of result.rows) {

            const newPriority = updatePriorityByTime(problem);


            if (newPriority !== problem.priority) {

                await pool.query(
                    `
                    UPDATE public.problems
                    SET priority = $1
                    WHERE id = $2
                    `,
                    [
                        newPriority,
                        problem.id
                    ]
                );


                problem.priority = newPriority;

            }

        }

        res.json(result.rows);

    } catch (error) {

        console.error(error);
        res.status(500).send("Ошибка получения активных проблем");

    }
});


// Архив проблем
app.get("/problems/archive", async (req, res) => {
    try {

        const result = await pool.query(`
            SELECT 
                id,
                type,
                description,
                status,
                priority,
                address,
                landmark,
                ST_X(location) AS longitude,
                ST_Y(location) AS latitude,
                created_at,
                resolved_at,
                resolution_comment
            FROM public.problems
            WHERE status = 'done'
            ORDER BY resolved_at DESC
            LIMIT 50
        `);


        res.json(result.rows);


    } catch (error) {

        console.error(error);
        res.status(500).send("Ошибка получения архива");

    }
});

// Количество активных и архивных проблем
app.get("/problems/counts", async (req, res) => {

    try {

        const result = await pool.query(`
            SELECT
                COUNT(*) FILTER (WHERE status != 'done') AS active,
                COUNT(*) FILTER (WHERE status = 'done') AS archive
            FROM public.problems;
        `);


        res.json(result.rows[0]);


    } catch (error) {

        console.error(error);

        res.status(500).json({
            error: error.message
        });

    }

});

app.get("/outages", async (req, res) => {

    try {

        const result = await pool.query(
            `
            SELECT *
            FROM power_outages
            WHERE status = 'active'
            ORDER BY created_at DESC
            `
        );


        res.json(result.rows);


    } catch(error) {

        console.error("Ошибка загрузки отключений:", error);

        res.status(500).json({
            error: "Ошибка сервера"
        });
    }

});

app.get("/outages/map", async (req, res) => {

    try {

        const result = await pool.query(`
            SELECT
                id,
                type,
                description,
                addresses,
                restore_time,
                created_at,
                transformer_points,
                feeder,
                status,
                address_points
            FROM power_outages
            WHERE status = 'active'
            ORDER BY created_at DESC
        `);


        const outages = [];


        for (const outage of result.rows) {

            let locations = [];

            // =====================================================
            // 1. ИСПОЛЬЗУЕМ УЖЕ СОХРАНЁННЫЕ КООРДИНАТЫ
            // =====================================================

            if (
                Array.isArray(outage.address_points) &&
                outage.address_points.length > 0
            ) {

                locations = outage.address_points
                    .filter(point =>
                        point &&
                        point.address &&
                        Number.isFinite(Number(point.latitude)) &&
                        Number.isFinite(Number(point.longitude))
                    )
                    .map(point => ({

                        address: point.address,

                        latitude:
                            Number(point.latitude),

                        longitude:
                            Number(point.longitude)

                    }));

            }


            // =====================================================
            // 2. ЕСЛИ КООРДИНАТ НЕТ — ПЫТАЕМСЯ ГЕОКОДИРОВАТЬ
            // =====================================================

            const addresses =
                Array.isArray(outage.addresses)
                    ? outage.addresses
                    : [];


            for (const address of addresses) {

                if (!address) {
                    continue;
                }


                // -------------------------------------------------
                // Уже есть координаты для этого адреса
                // -------------------------------------------------

                const alreadyExists =
                    locations.some(
                        location =>
                            location.address === address
                    );


                if (alreadyExists) {
                    continue;
                }


                // -------------------------------------------------
                // Геокодирование через Nominatim
                // -------------------------------------------------

                try {

                    const query =
                        `${address}, Каспийск, Республика Дагестан, Россия`;


                    console.log(
                        "📍 Геокодируем новый адрес:",
                        address
                    );


                    const response =
                        await fetch(
                            `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`,
                            {
                                headers: {
                                    "User-Agent":
                                        "Kaspiysk Map/1.0"
                                }
                            }
                        );


                    if (!response.ok) {

                        console.log(
                            "Nominatim error:",
                            response.status,
                            address
                        );

                        continue;
                    }


                    const data =
                        await response.json();


                    if (
                        !data ||
                        data.length === 0
                    ) {

                        console.log(
                            "⚠️ Адрес не найден:",
                            address
                        );

                        continue;
                    }


                    const latitude =
                        Number(data[0].lat);


                    const longitude =
                        Number(data[0].lon);


                    if (
                        !Number.isFinite(latitude) ||
                        !Number.isFinite(longitude)
                    ) {

                        console.log(
                            "⚠️ Некорректные координаты:",
                            address
                        );

                        continue;
                    }


                    const location = {

                        address,

                        latitude,

                        longitude

                    };


                    locations.push(location);


                    // =================================================
                    // 3. СОХРАНЯЕМ КООРДИНАТЫ В БД
                    // =================================================

                    await pool.query(
                        `
                        UPDATE power_outages
                        SET address_points = $1::jsonb
                        WHERE id = $2
                        `,
                        [
                            JSON.stringify(locations),
                            outage.id
                        ]
                    );


                    console.log(
                        "✅ Координаты сохранены:",
                        address,
                        latitude,
                        longitude
                    );


                } catch (error) {

                    console.error(
                        "Ошибка геокодирования:",
                        address,
                        error.message
                    );

                }

            }


            // =====================================================
            // 4. ДОБАВЛЯЕМ ОТКЛЮЧЕНИЕ В РЕЗУЛЬТАТ
            // =====================================================

            if (locations.length > 0) {

                outages.push({

                    id:
                        outage.id,

                    type:
                        outage.type,

                    description:
                        outage.description,

                    addresses:
                        outage.addresses,

                    restore_time:
                        outage.restore_time,

                    created_at:
                        outage.created_at,

                    feeder:
                        outage.feeder,

                    locations

                });

            }

        }


        res.json(outages);


    } catch (error) {

        console.error(
            "Ошибка загрузки отключений для карты:",
            error
        );


        res.status(500).json({
            error:
                "Ошибка загрузки отключений"
        });

    }

});

app.get("/outages/active", async (req,res)=>{

    const result = await pool.query(
        `
        SELECT *
        FROM power_outages
        WHERE status='active'
        ORDER BY created_at DESC
        `
    );

    res.json(result.rows);

});

app.get("/outages/done", async (req,res)=>{

    const result = await pool.query(
        `
        SELECT *
        FROM power_outages
        WHERE status='done'
        ORDER BY created_at DESC
        `
    );

    res.json(result.rows);

});

app.get("/admin/outages", async (req,res)=>{

    try {

        const result = await pool.query(
            `
            SELECT *
            FROM power_outages
            ORDER BY created_at DESC
            `
        );


        res.json(result.rows);


    } catch(error){

        console.error(error);

        res.status(500).json({
            error:"Ошибка загрузки отключений"
        });

    }

});

function formatAddress(address) {

    if (!address) {
        return "Адрес не найден";
    }

    let road = address.road || "";

    // сокращаем типы улиц

    road = road
        .replace(/^улица\s+/i, "ул. ")
        .replace(/^проспект\s+/i, "пр-т ")
        .replace(/^переулок\s+/i, "пер. ")
        .replace(/^бульвар\s+/i, "бул. ")
        .replace(/^площадь\s+/i, "пл. ")
        .replace(/^шоссе\s+/i, "ш. ")
        .replace(/^проезд\s+/i, "пр-д ");

    // улица + дом

    if (road && address.house_number) {
        return `${road}, ${address.house_number}`;
    }

    // только улица

    if (road) {
        return `район ${road}`;
    }

    // микрорайон

    if (address.suburb) {
        return address.suburb;
    }

    // район

    if (address.neighbourhood) {
        return address.neighbourhood;
    }

    // населённый пункт

    if (address.hamlet) {
        return address.hamlet;
    }

    return "Адрес не определён";
}

function formatLandmark(data) {

    const address = data.address;

    if (!address) {
        return null;
    }


    // объекты с названием

    if (address.name) {
        return address.name;
    }


    if (address.amenity && data.name) {
        return data.name;
    }


    if (address.shop && data.name) {
        return data.name;
    }


    if (address.school && data.name) {
        return data.name;
    }


    if (address.hospital && data.name) {
        return data.name;
    }


    if (address.park && data.name) {
        return data.name;
    }


    return null;

}

function updatePriorityByTime(problem) {

    if (problem.status === "done") {
        return problem.priority;
    }


    const created = new Date(problem.created_at);

    const now = new Date();


    const days =
        (now - created) /
        (1000 * 60 * 60 * 24);


    let priority = problem.priority;


    if (days > 30 && priority === "medium") {

        priority = "high";

    }


    else if (days > 7 && priority === "low") {

        priority = "medium";

    }


    return priority;

}

const createProblemLimiter = rateLimit({

    windowMs: 10 * 60 * 1000, // 10 минут

    max: 3,

    message: {
        error: "Слишком много заявок. Попробуйте позже."
    },

    standardHeaders: true,

    legacyHeaders: false

});

app.post(
    "/problems",
    createProblemLimiter,
    upload.array("photos", 3),
    async (req, res) => {
    try {

        console.log("FILES", req.files);

        const {
            type,
            description,
            longitude,
            latitude
        } = req.body;

        // Получаем адрес по координатам

        const geoResponse = await fetch(

            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`,

            {
                headers: {
                    "User-Agent": "Kaspiysk Map"
                }
            }

        );

        let address = "Адрес не определён";
        let landmark = "";

        if (!geoResponse.ok) {

            const errorText = await geoResponse.text();

            console.log(
                "Nominatim error:",
                geoResponse.status,
                errorText
            );

        } else {

            try {

                const geoData = await geoResponse.json();

                address = formatAddress(
                    geoData.address || {}
                );

                landmark = formatLandmark(
                    geoData
                );

            } catch (error) {

                console.log(
                    "Не удалось определить адрес:",
                    error.message
                );

            }

        }

        const result = await pool.query(
            `
            INSERT INTO public.problems
            (
                type,
                description,
                priority,
                status,
                location,
                address,
                landmark
            )
            VALUES
            (
                $1,
                $2,
                'low',
                'new',
                ST_SetSRID(ST_MakePoint($3, $4), 4326),
                $5,
                $6
            )
            RETURNING 
                id,
                type,
                description,
                priority,
                status,
                address,
                landmark,
                ST_X(location) AS longitude,
                ST_Y(location) AS latitude,
                created_at;
            `,
            [
                type,
                description,
                longitude,
                latitude,
                address,
                landmark
            ]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: "Проблема не найдена"
            });
        }

        const problemId = result.rows[0].id;

        console.log(
            `[${new Date().toISOString()}] Создана проблема #${problemId}:`,
            {
                type,
                address,
                latitude,
                longitude
            }
        );

        await sendTelegram(`
🚨 Новая заявка

🛠 Тип: ${type}

📍 Адрес: ${address}

📝 Описание: ${description || "нет описания"}

🆔 ID: ${problemId}
        `);


        const photoPaths = await savePhotos(
            req.files,
            problemId
        );

        for (const photoPath of photoPaths) {

            await pool.query(
                `
                INSERT INTO public.problem_photos
                (
                    problem_id,
                    photo_path
                )

                VALUES
                (
                    $1,
                    $2
                );
                `,
                [
                    problemId,
                    photoPath
                ]
            );

        }

        res.json(result.rows[0]);

    } catch (error) {
        console.error(error);
        res.status(500).send("Ошибка создания проблемы");
    }
});

app.put("/problems/:id", adminAuth, async (req, res) => {
    try {

        const { id } = req.params;

        const {
            status,
            resolution_comment
        } = req.body;


        console.log({
            id,
            status,
            resolution_comment
        });


        let result;


        if (status === "done") {

            result = await pool.query(
                `
                UPDATE public.problems

                SET 
                    status = $1,
                    resolved_at = NOW(),
                    resolution_comment = $2

                WHERE id = $3

                RETURNING 
                    id,
                    type,
                    description,
                    address,
                    landmark,
                    status,
                    priority,
                    created_at,
                    resolved_at,
                    resolution_comment;
                `,
                [
                    status,
                    resolution_comment,
                    id
                ]
            );


        } else {


            result = await pool.query(
                `
                UPDATE public.problems

                SET 
                    status = $1

                WHERE id = $2

                RETURNING 
                    id,
                    type,
                    description,
                    status,
                    priority,
                    created_at;
                `,
                [
                    status,
                    id
                ]
            );

        }


        if (result.rows.length === 0) {
            return res.status(404).json({
                error: "Проблема не найдена"
            });
        }


        res.json(result.rows[0]);


    } catch (error) {

        console.error(error);

        res.status(500).json({
            error: error.message
        });

    }
});

// Вернуть проблему из архива в активные
app.put("/problems/:id/restore", adminAuth, async (req, res) => {

    try {

        const { id } = req.params;


        const result = await pool.query(
            `
            UPDATE public.problems

            SET
                status = 'in_progress',
                resolved_at = NULL,
                resolution_comment = NULL

            WHERE id = $1

            RETURNING
                id,
                type,
                description,
                status,
                priority,
                created_at;
            `,
            [
                id
            ]
        );


        if (result.rows.length === 0) {

            return res.status(404).json({
                error: "Проблема не найдена"
            });

        }


        res.json(result.rows[0]);


    } catch (error) {

        console.error(error);

        res.status(500).json({
            error: error.message
        });

    }

});

app.put("/problems/:id/priority", adminAuth, async (req, res) => {

    try {

        const { id } = req.params;

        const { priority } = req.body;


        const result = await pool.query(
            `
            UPDATE public.problems

            SET priority = $1

            WHERE id = $2

            RETURNING
                id,
                priority,
                created_at;
                
            `,
            [
                priority,
                id
            ]
        );


        if (result.rows.length === 0) {

            return res.status(404).json({
                error: "Проблема не найдена"
            });

        }


        res.json(result.rows[0]);


    } catch (error) {

        console.error(error);

        res.status(500).json({
            error: error.message
        });

    }

});

app.put("/outages/:id/done", async (req,res)=>{

    await pool.query(`
        UPDATE power_outages
        SET status='done'
        WHERE id=$1
    `,[req.params.id]);

    res.json({
        success:true
    });

});

app.put("/admin/outages/:id/done", async(req,res)=>{

    try {


        const result = await pool.query(
            `
            UPDATE power_outages
            SET status='done'
            WHERE id=$1
            RETURNING *
            `,
            [
                req.params.id
            ]
        );


        res.json(result.rows[0]);


    } catch(error){

        console.error(error);

        res.status(500).json({
            error:"Ошибка закрытия"
        });

    }

});

// =========================================================
// ОТКЛЮЧЕНИЯ ЭЛЕКТРОЭНЕРГИИ ДЛЯ КАРТЫ
// =========================================================

const outageGeocodeCache = new Map();

function normalizeOutageAddress(address) {

    if (!address) {
        return null;
    }

    return address
        .replace(/\.$/, "")
        .replace(/\s+/g, " ")
        .trim();
}


function expandOutageAddresses(addresses) {

    const result = [];

    let currentStreet = null;


    for (const rawAddress of addresses) {

        if (!rawAddress) {
            continue;
        }


        let address =
            rawAddress
                .replace(/\.$/, "")
                .replace(/\s+/g, " ")
                .trim();


        // -------------------------------------------------
        // Ищем название улицы
        // -------------------------------------------------

        const streetMatch = address.match(
            /^(ул\.|улица|проспект|пр-т|переулок|пер\.|бульвар|бул\.|шоссе|ш\.|проезд|пр-д)\s*[^0-9]+/i
        );


        if (streetMatch) {

            currentStreet =
                streetMatch[0]
                    .trim()
                    .replace(/\s+дома\s*[-–—]?\s*$/i, "")
                    .replace(/\s+дом\s*[-–—]?\s*$/i, "")
                    .trim();

        }


        // -------------------------------------------------
        // "ул. Ленина дома - 33, 33А"
        // -------------------------------------------------

        const housesMatch =
            address.match(
                /дома?\s*[-–—:]?\s*(.+)$/i
            );


        if (
            housesMatch &&
            currentStreet
        ) {

            const houses =
                housesMatch[1]
                    .split(/,\s*/)
                    .map(h => h.trim())
                    .filter(Boolean);


            for (const house of houses) {

                result.push(
                    `${currentStreet}, ${house}`
                );

            }


            continue;
        }


        // -------------------------------------------------
        // Просто улица
        // -------------------------------------------------

        if (
            currentStreet &&
            /^[0-9А-Яа-яЁё]+[А-Яа-яЁё]?$/u.test(address)
        ) {

            result.push(
                `${currentStreet}, ${address}`
            );

            continue;
        }


        // -------------------------------------------------
        // Обычный адрес
        // -------------------------------------------------

        result.push(address);

    }


    // Убираем дубли

    return [
        ...new Set(result)
    ];

}


async function geocodeOutageAddress(address) {

    const normalized =
        normalizeOutageAddress(address);


    if (!normalized) {
        return null;
    }


    if (
        outageGeocodeCache.has(normalized)
    ) {

        return outageGeocodeCache.get(
            normalized
        );

    }


    try {

        const query =
            `${normalized}, Каспийск, Республика Дагестан, Россия`;


        const response =
            await fetch(

                `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=1&q=${encodeURIComponent(query)}`,

                {
                    headers: {
                        "User-Agent":
                            "Kaspiysk Map/1.0"
                    }
                }

            );


        if (!response.ok) {

            console.error(
                "Nominatim:",
                response.status,
                normalized
            );

            outageGeocodeCache.set(
                normalized,
                null
            );

            return null;
        }


        const data =
            await response.json();


        if (!data.length) {

            console.log(
                "📍 Не найден:",
                normalized
            );

            outageGeocodeCache.set(
                normalized,
                null
            );

            return null;
        }


        const location = {

            latitude:
                Number(data[0].lat),

            longitude:
                Number(data[0].lon),

            display_name:
                data[0].display_name ||
                normalized

        };


        outageGeocodeCache.set(
            normalized,
            location
        );


        console.log(
            "📍 Геокодирован:",
            normalized,
            "→",
            location.latitude,
            location.longitude
        );


        return location;


    } catch (error) {

        console.error(
            "Ошибка геокодирования:",
            error.message
        );


        outageGeocodeCache.set(
            normalized,
            null
        );


        return null;

    }

}


// =========================================================
// API ОТКЛЮЧЕНИЙ ДЛЯ КАРТЫ
// =========================================================

app.get("/outages/map", async (req, res) => {

    try {

        const result = await pool.query(`
            SELECT
                id,
                type,
                feeder,
                transformer_points,
                description,
                addresses,
                restore_time,
                status,
                created_at,
                telegram_id
            FROM power_outages
            WHERE status = 'active'
            ORDER BY created_at DESC
        `);


        const outages = [];


        for (const outage of result.rows) {

            const rawAddresses =
                Array.isArray(outage.addresses)
                    ? outage.addresses
                    : [];

const addresses =
    expandOutageAddresses(rawAddresses);


            const locations = [];


            for (const address of addresses) {

                const location =
                    await geocodeOutageAddress(address);


                if (!location) {
                    continue;
                }


                locations.push({

                    address,

                    latitude:
                        location.latitude,

                    longitude:
                        location.longitude,

                    display_name:
                        location.display_name

                });

            }


            // Показываем отключение только если
            // хотя бы один адрес удалось определить

            if (locations.length === 0) {
                continue;
            }


            outages.push({

                id: outage.id,

                type: outage.type,

                description:
                    outage.description,

                restore_time:
                    outage.restore_time,

                status:
                    outage.status,

                created_at:
                    outage.created_at,

                telegram_id:
                    outage.telegram_id,

                locations

            });

        }


        res.json(outages);


    } catch (error) {

        console.error(
            "Ошибка формирования карты отключений:",
            error
        );


        res.status(500).json({

            error:
                "Ошибка загрузки отключений"

        });

    }

});

app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});

parseTelegram();

setInterval(
    parseTelegram,
    5 * 60 * 1000
);