// client/src/api/timelapse.api.js
import axiosInstance from './axiosInstance';

// ✅ 파일명 문자열만 서버로 전송
export const uploadTimelapseAPI = (imm_idx, fileName) => {
  return axiosInstance.post('/timelapses', { imm_idx, file_name: fileName });
};

export const getTimelapsesAPI = (imm_idx) =>
  axiosInstance.get(`/timelapses/${imm_idx}`);
