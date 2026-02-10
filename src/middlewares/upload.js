import multer from "multer";
const storage = multer.memoryStorage({
    destination: function (req, file, cb) {
        cb(null, "/");
    }
});
const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }
}).single("image");
export default upload; 