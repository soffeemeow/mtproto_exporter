import process from "node:process";

const API_ID = Number.parseInt(process.env.API_ID!);
const API_HASH = process.env.API_HASH!;

const USERBOT_PHONE = process.env.USERBOT_PHONE;
const USERBOT_2FACODE = process.env.USERBOT_2FACODE;
const USERBOT_PASSWORD = process.env.USERBOT_PASSWORD;

if (Number.isNaN(API_ID) || !API_HASH) {
    throw new Error("API_ID or API_HASH not set!");
}

export { API_HASH, API_ID, USERBOT_2FACODE, USERBOT_PASSWORD, USERBOT_PHONE };
