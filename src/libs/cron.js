import cron from "cron";
import https from "https";
const job = new cron.CronJob("*/14 * * * *", function () {
    https
        .get("https://chatapp-backend-eiae.onrender.com", (res) => {
            if (res.statusCode === 200) console.log("GET request sent successfully");
            else console.log("GET request failed", res.statusCode);
        })
        .on("error", (e) => console.error("Error while sending request", e));
});

export default job;
