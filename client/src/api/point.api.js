// client/src/api/point.api.js
import axiosInstance from './axiosInstance';

export const getPointHistoryAPI = () => axiosInstance.get('/points');
