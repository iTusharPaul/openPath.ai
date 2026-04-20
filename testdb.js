require("dotenv").config();

const { pool } = require("./db/db");

(async () => {
  try {
    const res = await pool.query("SELECT NOW()");
    console.log(res.rows);
  } catch (err) {
    console.error(err);
  }
})();