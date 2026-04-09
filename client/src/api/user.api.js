// client/src/api/user.api.js
import axiosInstance from './axiosInstance';

export const getMeAPI = () => axiosInstance.get('/users/me');
export const getMyStatsAPI = () => axiosInstance.get('/users/me/stats');
export const updateMeAPI = (data) => axiosInstance.put('/users/me', data);
export const getMyPoseStatsAPI = () => axiosInstance.get('/users/me/pose-stats'); // 👈 추가
export const getRankingAPI = () => axiosInstance.get('/users/ranking');// 👈 추가
export const getMyStreakAPI = () => axiosInstance.get('/users/me/streak');