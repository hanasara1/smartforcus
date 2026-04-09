// client/src/api/badge.api.js
import axiosInstance from './axiosInstance';

export const getBadgeListAPI  = ()           => axiosInstance.get('/badges');
export const purchaseBadgeAPI = (badge_idx)  => axiosInstance.post(`/badges/${badge_idx}/purchase`);
