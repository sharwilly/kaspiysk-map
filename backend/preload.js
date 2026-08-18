const express = require("express");
const multer = require("multer");

const originalPut = express.application.put;
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }
});

express.application.put = function (path, ...handlers) {
    if (path === "/problems/:id") {
        handlers.unshift(upload.single("resolution_photo"));
    }

    return originalPut.call(this, path, ...handlers);
};