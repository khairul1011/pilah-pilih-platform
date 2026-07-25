const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");
const upload = require("../middleware/multerConfig");

const {
    createPickup,
    getMyPickups,
    getPickupById,
    getPendingPickups,
    getMyActivePickups,
    updateStatus,
    uploadPhoto,
    getWaitingPickups,
    weighItems,
    confirmAndComplete,
    confirmDeposit,
    getPetugasContacts,
    estimateFee,
    getAllMyPickups,
    runMigration
} = require("../controllers/pickupController");

// ================= USER =================
router.get("/run-migration", verifyToken, roleMiddleware("admin"), runMigration);
router.post("/estimate", verifyToken, roleMiddleware("user"), estimateFee);
router.post("/", verifyToken, roleMiddleware("user"), upload.single("waste_photo"), createPickup);
router.get("/my", verifyToken, roleMiddleware("user"), getMyPickups);

// ================= PETUGAS =================
router.get("/pending", verifyToken, roleMiddleware("petugas", "admin"), getPendingPickups);
router.get("/petugas/active", verifyToken, roleMiddleware("petugas"), getMyActivePickups);
router.get("/petugas/all", verifyToken, roleMiddleware("petugas"), getAllMyPickups);
router.get("/contacts", verifyToken, roleMiddleware("petugas", "admin"), getPetugasContacts);

// ================= PENGEPUL & PETUGAS (Proses Selesai) =================
router.get("/pengepul/waiting", verifyToken, roleMiddleware("pengepul"), getWaitingPickups);
router.put("/pengepul/weigh/:id", verifyToken, roleMiddleware("pengepul", "petugas"), weighItems);
router.put("/pengepul/confirm/:id", verifyToken, roleMiddleware("pengepul", "petugas"), confirmAndComplete);
router.patch("/pengepul/confirm-deposit/:id", verifyToken, roleMiddleware("pengepul"), confirmDeposit);

// ================= SHARED MUTATIONS =================
router.put("/status/:id", verifyToken, roleMiddleware("user", "petugas", "pengepul", "admin"), updateStatus);
router.post("/photo/:id", verifyToken, roleMiddleware("petugas", "pengepul"), upload.single("photo"), uploadPhoto);

// ================= UNIVERSAL (GET DETAIL) =================
router.get("/:id", verifyToken, getPickupById);

module.exports = router;
