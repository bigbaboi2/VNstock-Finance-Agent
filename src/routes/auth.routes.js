import express from 'express';
import { register, login, getPreferences, updatePreferences } from '../controllers/auth.controller.js';

const router = express.Router();

router.post('/register', register); 

router.post('/login', login);

router.get('/preferences', getPreferences);
router.post('/preferences', updatePreferences);

export default router;
