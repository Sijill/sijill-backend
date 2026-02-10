export function validateConfig() {
    const required = ['JWT_ACCESS_SECRET'];
    
    for (const key of required) {
        if (!process.env[key]) {
            throw new Error(`Missing required environment variable: ${key}`);
        }
    }
}