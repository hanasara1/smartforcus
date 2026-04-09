// client/src/api/report.api.js
import axiosInstance from './axiosInstance';

export const getReportListAPI = (page = 1, limit = 10) =>
  axiosInstance.get(`/reports?page=${page}&limit=${limit}`);

export const getReportAPI      = (imm_idx)  => axiosInstance.get(`/reports/${imm_idx}`);
export const genFeedbackAPI    = (imm_idx)  => axiosInstance.post(`/reports/${imm_idx}/feedback`);
