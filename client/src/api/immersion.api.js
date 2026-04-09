// client/src/api/immersion.api.js
import axiosInstance from './axiosInstance';

export const startSessionAPI = (data)             => axiosInstance.post('/immersions', data);
export const endSessionAPI   = (imm_idx, data)    => axiosInstance.patch(`/immersions/${imm_idx}/end`, data);
export const getImmListAPI   = (page = 1)         => axiosInstance.get(`/immersions?page=${page}`);
export const getImmOneAPI    = (imm_idx)          => axiosInstance.get(`/immersions/${imm_idx}`);
