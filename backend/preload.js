require("dotenv").config();

const express = require("express");
const multer = require("multer");

const originalPut = express.application.put;
const originalUse = express.application.use;
const dogsRouter = require("./routes/dogs");

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }
});

let dogsMounted = false;

express.application.use = function (...args) {
    const result = originalUse.apply(this, args);

    // The main server registers CORS before its routes. Mount dogs immediately
    // after that middleware so the new API follows the same public API path.
    if (!dogsMounted) {
        originalUse.call(this, "/dogs", dogsRouter);
        dogsMounted = true;
    }

    return result;
};

express.application.put = function (path, ...handlers) {
    if (path === "/problems/:id") {
        handlers.unshift(upload.single("resolution_photo"));
    }

    return originalPut.call(this, path, ...handlers);
};
