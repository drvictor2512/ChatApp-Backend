import multer from "multer";
const storage = multer.memoryStorage({
    destination: function (req, file, cb) {
        cb(null, "/");
    }
});
const uploader = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }
});

const upload = uploader.single("image");
export const uploadMultiple = uploader.fields([
    { name: 'image', maxCount: 10 },
    { name: 'file', maxCount: 10 },
]);

export default upload;