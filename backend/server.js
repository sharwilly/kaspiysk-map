const express = require("express");
const cors = require("cors");
require("dotenv").config();

const multer = require("multer");
const path = require("path");
const fs = require("fs");

const pool = require("./db");

const app = express();
console.log("Сервер запущен");


app.use(cors());
app.use(express.json());

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


    const folder = path.join(
        "uploads",
        String(problemId)
    );


    fs.mkdirSync(folder, {
        recursive: true
    });


    const paths = [];


    files.forEach((file, index) => {


        const filename =
            `${index + 1}${path.extname(file.originalname)}`;


        const filepath =
            path.join(
                folder,
                filename
            );


        fs.writeFileSync(
            filepath,
            file.buffer
        );


        paths.push(
            filepath.replaceAll("\\", "/"));

    });


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

app.post(
    "/problems",
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

        const geoData = await geoResponse.json();

        const address = formatAddress(
            geoData.address
        );

        const landmark = formatLandmark(
            geoData
        );

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

app.put("/problems/:id", async (req, res) => {
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
app.put("/problems/:id/restore", async (req, res) => {

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

app.put("/problems/:id/priority", async (req, res) => {

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

app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});