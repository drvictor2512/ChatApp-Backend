import cron from "cron";
import https from "https";
const job = new cron.CronJob("*/14 * * * *", function () {
    const req = https.get("https://chatapp-backend-eiae.onrender.com", (res) => {
        const statusCode = res.statusCode ?? 0;

        if (statusCode < 500) {
            console.log("GET request sent successfully", statusCode);
        } else {
            console.log("GET request failed", statusCode);
        }

        res.resume();
    });

    req.setTimeout(10000, () => {
        req.destroy(new Error("Request timeout after 10s"));
    });

    req.on("error", (e) => console.error("Error while sending request", e.message));
});

export default job;
