export class AppError extends Error {
    constructor(message, status = 500, details = null) {
        super(message)
        this.name = 'AppError'
        this.status = status
        this.details = details
    }
}

export const toHttpError = (error, fallbackStatus = 500) => {
    if (error && typeof error.status === 'number') {
        return { status: error.status, message: error.message, details: error.details || null }
    }
    return { status: fallbackStatus, message: error?.message || 'Internal server error', details: null }
}
