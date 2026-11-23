import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT || 4000),
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  jwtSecret: process.env.JWT_SECRET || '',
  passwordResetBaseUrl: process.env.PASSWORD_RESET_BASE_URL || 'http://localhost:5173',
  exposeResetToken: process.env.RESET_TOKEN_EXPOSE_IN_DEVELOPMENT === 'true',
  maxWorkshopImageMb: Number(process.env.MAX_WORKSHOP_IMAGE_MB || 5),
  maxVehicleImageMb: Number(process.env.MAX_VEHICLE_IMAGE_MB || 15),
  db: { host: process.env.DB_HOST || '127.0.0.1', port: Number(process.env.DB_PORT || 3306), database: process.env.DB_NAME || 'baumar', user: process.env.DB_USER || 'baumar_app', password: process.env.DB_PASSWORD || '' },
};
