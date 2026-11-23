/** Adapta controladores async al contrato Express 4 y reenvía los rechazos al middleware central de errores. */
export const asyncHandler = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
