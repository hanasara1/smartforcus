// client/src/api/skin.api.js
import axiosInstance from './axiosInstance';

export const getSkinListAPI = () => axiosInstance.get('/skins');
export const getActiveSkinAPI = () => axiosInstance.get('/skins/active');
export const purchaseSkinAPI = (skin_idx) => axiosInstance.post('/skins/purchase', { skin_idx });
export const applySkinAPI = (skin_idx) => axiosInstance.patch('/skins/apply', { skin_idx });
