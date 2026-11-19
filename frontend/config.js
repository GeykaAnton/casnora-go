// Cambia esta URL por la URL pública de tu backend en Railway cuando despliegues en Vercel
// Ejemplo: 'https://casnorago-backend-production.up.railway.app/api'
window.CASNORAGO_CONFIG = {
  API_URL: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000/api'
    : 'https://casnorago-backend-production.up.railway.app/api',
};
