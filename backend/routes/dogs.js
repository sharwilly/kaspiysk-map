const rateLimit = require("express-rate-limit");

function createDogsRouter({ express, pool, upload, savePhotos }) {
    const router = express.Router();

    const createDogLimiter = rateLimit({
        windowMs: 10 * 60 * 1000,
        max: 5,
        message: {
            error: "Слишком много отметок. Попробуйте позже."
        },
        standardHeaders: true,
        legacyHeaders: false
    });

    router.get("/", async (req, res) => {
        try {
            const result = await pool.query(`
                SELECT
                    d.id,
                    d.description,
                    d.address,
                    d.landmark,
                    ST_X(d.location) AS longitude,
                    ST_Y(d.location) AS latitude,
                    d.created_at,
                    COALESCE(
                        json_agg(p.photo_path)
                        FILTER (WHERE p.id IS NOT NULL),
                        '[]'
                    ) AS photos
                FROM public.dog_sightings d
                LEFT JOIN public.dog_photos p
                    ON d.id = p.sighting_id
                GROUP BY d.id
                ORDER BY d.created_at DESC
            `);

            res.json(result.rows);
        } catch (error) {
            console.error("Ошибка загрузки отметок собак:", error);
            res.status(500).json({
                error: "Ошибка загрузки отметок собак"
            });
        }
    });

    router.post(
        "/",
        createDogLimiter,
        upload.array("photos", 3),
        async (req, res) => {
            try {
                const {
                    description,
                    longitude,
                    latitude
                } = req.body;

                const lon = Number(longitude);
                const lat = Number(latitude);

                if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
                    return res.status(400).json({
                        error: "Некорректные координаты"
                    });
                }

                if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
                    return res.status(400).json({
                        error: "Координаты находятся вне допустимого диапазона"
                    });
                }

                let address = "Адрес не определён";
                let landmark = null;

                try {
                    const geoResponse = await fetch(
                        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=${lat}&lon=${lon}`,
                        {
                            headers: {
                                "User-Agent": "Kaspiysk Map/1.0"
                            }
                        }
                    );

                    if (geoResponse.ok) {
                        const geoData = await geoResponse.json();
                        address = formatAddress(geoData.address || {});
                        landmark = formatLandmark(geoData);
                    } else {
                        console.warn(
                            "Nominatim error:",
                            geoResponse.status
                        );
                    }
                } catch (error) {
                    console.warn(
                        "Не удалось определить адрес собаки:",
                        error.message
                    );
                }

                const result = await pool.query(
                    `
                    INSERT INTO public.dog_sightings
                    (
                        description,
                        location,
                        address,
                        landmark
                    )
                    VALUES
                    (
                        $1,
                        ST_SetSRID(ST_MakePoint($2, $3), 4326),
                        $4,
                        $5
                    )
                    RETURNING
                        id,
                        description,
                        address,
                        landmark,
                        ST_X(location) AS longitude,
                        ST_Y(location) AS latitude,
                        created_at;
                    `,
                    [
                        description || null,
                        lon,
                        lat,
                        address,
                        landmark
                    ]
                );

                if (!result.rows.length) {
                    return res.status(500).json({
                        error: "Не удалось создать отметку"
                    });
                }

                const sighting = result.rows[0];
                const photoPaths = await savePhotos(
                    req.files,
                    `dogs/${sighting.id}`
                );

                for (const photoPath of photoPaths) {
                    await pool.query(
                        `
                        INSERT INTO public.dog_photos
                        (
                            sighting_id,
                            photo_path
                        )
                        VALUES ($1, $2)
                        `,
                        [sighting.id, photoPath]
                    );
                }

                res.status(201).json({
                    ...sighting,
                    photos: photoPaths
                });
            } catch (error) {
                console.error("Ошибка создания отметки собаки:", error);
                res.status(500).json({
                    error: "Ошибка создания отметки собаки"
                });
            }
        }
    );

    return router;
}

function formatAddress(address) {
    if (!address) return "Адрес не определён";

    let road = address.road || "";

    road = road
        .replace(/^улица\s+/i, "ул. ")
        .replace(/^проспект\s+/i, "пр-т ")
        .replace(/^переулок\s+/i, "пер. ")
        .replace(/^бульвар\s+/i, "бул. ")
        .replace(/^площадь\s+/i, "пл. ")
        .replace(/^шоссе\s+/i, "ш. ")
        .replace(/^проезд\s+/i, "пр-д ");

    if (road && address.house_number) {
        return `${road}, ${address.house_number}`;
    }

    if (road) return `район ${road}`;
    if (address.suburb) return address.suburb;
    if (address.neighbourhood) return address.neighbourhood;
    if (address.hamlet) return address.hamlet;

    return "Адрес не определён";
}

function formatLandmark(data) {
    const address = data?.address;
    if (!address) return null;

    if (address.name) return address.name;

    if (
        (address.amenity ||
            address.shop ||
            address.school ||
            address.hospital ||
            address.park) &&
        data.name
    ) {
        return data.name;
    }

    return null;
}

module.exports = createDogsRouter;
