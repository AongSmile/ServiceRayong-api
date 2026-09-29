import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { apiLimiter } from './middleware/security.js';
import { notFound, errorHandler } from './middleware/error.js';
import authRoutes from './routes/auth.routes.js';
import systemRoutes from './routes/systems.routes.js';
import chatRoutes from './routes/chat.routes.js';
import consentRoutes from './routes/consent.routes.js';
import privacyRoutes from './routes/privacy.routes.js';
import usersRoutes from './routes/users.routes.js';

export const app = express();

app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: '32kb' }));
app.use(cookieParser());
app.use('/api', apiLimiter);

app.get('/api/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));
app.use('/api/auth', authRoutes);
app.use('/api/systems', systemRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/consent', consentRoutes);
app.use('/api/privacy', privacyRoutes);
app.use('/api/users', usersRoutes); 


app.use(notFound);
app.use(errorHandler);