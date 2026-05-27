import axios from 'axios';

const apiClient = axios.create({
    baseURL: 'http://localhost:3001/api',
    timeout: 250000,
    headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true'
    }
});

export default apiClient;