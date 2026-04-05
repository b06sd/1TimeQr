import { Router } from "express";

import {

  getScanPage,

  getAdmitPage,

  verifyScan,

  getStats,

  listScans,

} from "../controllers/ticketController";



const router = Router();



// POST /api/scan/verify  -> called by the scan page JS

router.post("/verify", verifyScan);



// GET  /api/admin/stats  -> total admitted count

router.get("/stats", getStats);



// GET  /api/admin/scans  -> paginated list of admitted devices

router.get("/scans", listScans);



export { getScanPage, getAdmitPage };

export default router;

