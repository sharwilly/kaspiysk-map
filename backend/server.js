const express = require("express");
const cors = require("cors");
require("dotenv").config();

const cloudinary = require("cloudinary").v2;

const parseTelegram = require("./tasks/parseTelegram");

const multer = require("multer");
const path = require("path");
const fs = require("fs");

const pool = require("./db");
require("./trucks-init");

const app = express();

app.set("trust proxy", 1);

app.use(cors());
app.use(express.json());