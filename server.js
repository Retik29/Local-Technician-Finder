import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import bodyParser from 'body-parser';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { check, validationResult } from 'express-validator';

// Initialization
const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/local-services-finder';

// Security middleware
app.use(helmet());

// CORS configuration
app.use(cors({
    origin: '*', // Allow all origins in development
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Content-Range', 'X-Content-Range'],
    credentials: true
}));

// Additional CORS headers for preflight requests
app.options('*', cors()); // Enable pre-flight for all routes

app.use(bodyParser.json());

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: { error: 'Too many requests, please try again later' }
});
app.use(limiter);

// DB connection with retry logic
const connectDB = async () => {
    try {
        await mongoose.connect(MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 5000
        });
        console.log('Connected to MongoDB');
    } catch (err) {
        console.error('Failed to connect to MongoDB', err);
        setTimeout(connectDB, 5000); // Retry after 5 seconds
    }
};
connectDB();

// Schema validation
const ServiceSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    type: { type: String, required: true, trim: true },
    rating: { type: Number, min: 0, max: 5, required: true },
    contact: { type: String, required: true, trim: true },
    pinCode: { type: String, required: true, match: /^\d{6}$/ }
});

// Model for services
const Service = mongoose.model('Service', ServiceSchema);

// Input validation middleware
const validateService = [
    check('name').notEmpty().withMessage('Name is required'),
    check('type').notEmpty().withMessage('Type is required'),
    check('rating').isFloat({ min: 0, max: 5 }).withMessage('Rating must be between 0 and 5'),
    check('contact').notEmpty().withMessage('Contact is required'),
    check('pinCode').matches(/^\d{6}$/).withMessage('Invalid pincode format'),
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        next();
    }
];

// Routes
app.get('/services', async (req, res, next) => {
    try {
        const services = await Service.find();
        res.json(services);
    } catch (err) {
        next(err);
    }
});

app.post('/services', validateService, async (req, res, next) => {
    try {
        const service = new Service(req.body);
        await service.save();
        res.status(201).json(service);
    } catch (err) {
        next(err);
    }
});

app.get('/services/pin', async (req, res, next) => {
    try {
        const { pinCode } = req.query;
        if (!pinCode || !/^\d{6}$/.test(pinCode)) {
            return res.status(400).json({ message: "Invalid pincode format" });
        }
        const services = await Service.find({ pinCode });
        res.json(services);
    } catch (err) {
        next(err);
    }
});

app.delete('/services/name', async (req, res, next) => {
    try {
        const { name } = req.query;
        if (!name) {
            return res.status(400).json({ message: "Service name is required" });
        }
        const service = await Service.findOneAndDelete({ name });
        if (!service) {
            return res.status(404).json({ message: "Service not found" });
        }
        res.json({ message: "Service deleted successfully" });
    } catch (err) {
        next(err);
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: err.message });
});

// Starting server
app.listen(PORT, () => {
    console.log(`Server running at port: ${PORT}`);
});