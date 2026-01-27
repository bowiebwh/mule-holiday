// api/index.js
// 统一管理API调用

// 全局状态：是否正在刷新token
let isRefreshing = false;
// 存储待重试的请求队列
let retryRequests = [];

/**
 * 解析JWT Token
 * @param {string} token - JWT Token
 * @returns {object|null} - 解析后的payload，失败返回null
 */
const parseJWT = (token) => {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error('解析JWT失败:', error);
    return null;
  }
};

/**
 * 验证JWT Token格式
 * @param {string} token - JWT Token
 * @returns {object} - 验证结果
 */
const validateJWT = (token) => {
  if (!token) {
    return {
      valid: false,
      error: 'Token为空'
    };
  }
  
  const payload = parseJWT(token);
  if (!payload) {
    return {
      valid: false,
      error: 'Token格式不正确'
    };
  }
  
  // 检查必要字段
  const errors = [];
  
  if (!payload.sub) {
    errors.push('缺少sub字段（用户ID）');
  }
  
  if (!payload.type) {
    errors.push('缺少type字段（应为access或refresh）');
  } else if (payload.type !== 'access' && payload.type !== 'refresh') {
    errors.push('type字段值不正确（应为access或refresh）');
  }
  
  if (!payload.exp) {
    errors.push('缺少exp字段（过期时间）');
  } else if (typeof payload.exp !== 'number') {
    errors.push('exp字段应为数字类型');
  }
  
  return {
    valid: errors.length === 0,
    error: errors.length > 0 ? errors.join('; ') : null,
    payload: payload
  };
};

/**
 * 封装wx.request请求（用于JSON数据）
 * @param {string} url - 请求地址
 * @param {string} method - 请求方法
 * @param {object} data - 请求数据
 * @returns {Promise} - 返回Promise对象
 */
const request = async (url, method, data) => {
  const app = getApp();
  const apiBaseUrl = app.globalData.apiBaseUrl;
  // 从本地存储获取token
  let accessToken = wx.getStorageSync('accessToken') || '';
  
  return new Promise(async (resolve, reject) => {
    const doRequest = async () => {
      try {
        // 验证token格式
        if (accessToken) {
          const tokenValidation = validateJWT(accessToken);
          if (!tokenValidation.valid) {
            console.warn('Token格式验证失败:', tokenValidation.error);
            // 继续请求，由后端返回401进行处理
          }
        }
        
        const res = await new Promise((innerResolve, innerReject) => {
          wx.request({
            url: `${apiBaseUrl}${url}`,
            method,
            data,
            header: {
              'content-type': 'application/json',
              'Authorization': `Bearer ${accessToken}` // 添加token到请求头
            },
            timeout: 60000, // 设置60秒超时，适应LLM调用
            success: (res) => {
              if (res.statusCode === 200) {
                innerResolve(res.data);
              } else if (res.statusCode === 401) {
                // 401错误，需要刷新token
                innerReject({ code: 401, message: 'Unauthorized' });
              } else {
                innerReject(new Error(`请求失败: ${res.statusCode}`));
              }
            },
            fail: (err) => {
              innerReject(err);
            }
          });
        });
        resolve(res);
      } catch (error) {
        if (error.code === 401) {
          // 处理token过期
          if (!isRefreshing) {
            isRefreshing = true;
            
            try {
              // 验证refreshToken格式
              const refreshToken = wx.getStorageSync('refreshToken') || '';
              if (refreshToken) {
                const tokenValidation = validateJWT(refreshToken);
                if (!tokenValidation.valid) {
                  console.warn('RefreshToken格式验证失败:', tokenValidation.error);
                }
              }
              
              // 调用刷新token接口
              const refreshRes = await new Promise((refreshResolve, refreshReject) => {
                wx.request({
                  url: `${apiBaseUrl}/api/refresh-token`,
                  method: 'POST',
                  data: {
                    refresh_token: refreshToken
                  },
                  header: {
                    'content-type': 'application/json'
                  },
                  success: (res) => {
                    if (res.data.success) {
                      // 保存新token
                      const { access_token, refresh_token } = res.data.data;
                      
                      // 验证新token格式
                      const newTokenValidation = validateJWT(access_token);
                      if (!newTokenValidation.valid) {
                        console.warn('新Access Token格式验证失败:', newTokenValidation.error);
                      }
                      
                      wx.setStorageSync('accessToken', access_token);
                      wx.setStorageSync('refreshToken', refresh_token);
                      accessToken = access_token;
                      refreshResolve(res.data);
                    } else {
                      refreshReject(new Error('刷新token失败'));
                    }
                  },
                  fail: (err) => {
                    refreshReject(err);
                  }
                });
              });
              
              // 刷新成功，重试所有待处理请求
              retryRequests.forEach(callback => callback());
              retryRequests = [];
              
              // 重试当前请求
              doRequest();
            } catch (refreshError) {
              // 刷新失败，清空token并提示用户重新登录
              wx.removeStorageSync('accessToken');
              wx.removeStorageSync('refreshToken');
              retryRequests.forEach(callback => callback(refreshError));
              retryRequests = [];
              
              // 提示用户重新登录
              wx.showToast({
                title: '登录已过期，请重新登录',
                icon: 'none',
                duration: 3000
              });
              
              reject(new Error('登录已过期，请重新登录'));
            } finally {
              isRefreshing = false;
            }
          } else {
            // 正在刷新token，将请求加入队列
            await new Promise((queueResolve, queueReject) => {
              retryRequests.push(() => {
                doRequest().then(queueResolve).catch(queueReject);
              });
            });
          }
        } else {
          reject(error);
        }
      }
    };
    
    doRequest();
  });
};

/**
 * 封装wx.uploadFile请求（用于文件上传）
 * @param {string} url - 请求地址
 * @param {string} filePath - 文件路径
 * @param {string} name - 文件字段名
 * @param {object} formData - 表单数据
 * @returns {Promise} - 返回Promise对象
 */
const uploadFile = async (url, filePath, name, formData) => {
  const app = getApp();
  const apiBaseUrl = app.globalData.apiBaseUrl;
  // 从本地存储获取token
  let accessToken = wx.getStorageSync('accessToken') || '';
  
  return new Promise(async (resolve, reject) => {
    const doUpload = async () => {
      try {
        // 验证token格式
        if (accessToken) {
          const tokenValidation = validateJWT(accessToken);
          if (!tokenValidation.valid) {
            console.warn('Token格式验证失败:', tokenValidation.error);
            // 继续请求，由后端返回401进行处理
          }
        }
        
        const res = await new Promise((innerResolve, innerReject) => {
          wx.uploadFile({
            url: `${apiBaseUrl}${url}`,
            filePath,
            name,
            formData,
            header: {
              'content-type': 'multipart/form-data',
              'Authorization': `Bearer ${accessToken}` // 添加token到请求头
            },
            success: (res) => {
              if (res.statusCode === 200) {
                try {
                  const data = JSON.parse(res.data);
                  innerResolve(data);
                } catch (e) {
                  innerResolve(res.data);
                }
              } else if (res.statusCode === 401) {
                // 401错误，需要刷新token
                innerReject({ code: 401, message: 'Unauthorized' });
              } else {
                innerReject(new Error(`请求失败: ${res.statusCode}`));
              }
            },
            fail: (err) => {
              innerReject(err);
            }
          });
        });
        resolve(res);
      } catch (error) {
        if (error.code === 401) {
          // 处理token过期
          if (!isRefreshing) {
            isRefreshing = true;
            
            try {
              // 验证refreshToken格式
              const refreshToken = wx.getStorageSync('refreshToken') || '';
              if (refreshToken) {
                const tokenValidation = validateJWT(refreshToken);
                if (!tokenValidation.valid) {
                  console.warn('RefreshToken格式验证失败:', tokenValidation.error);
                }
              }
              
              // 调用刷新token接口
              const refreshRes = await new Promise((refreshResolve, refreshReject) => {
                wx.request({
                  url: `${apiBaseUrl}/api/refresh-token`,
                  method: 'POST',
                  data: {
                    refresh_token: refreshToken
                  },
                  header: {
                    'content-type': 'application/json'
                  },
                  success: (res) => {
                    if (res.data.success) {
                      // 保存新token
                      const { access_token, refresh_token } = res.data.data;
                      
                      // 验证新token格式
                      const newTokenValidation = validateJWT(access_token);
                      if (!newTokenValidation.valid) {
                        console.warn('新Access Token格式验证失败:', newTokenValidation.error);
                      }
                      
                      wx.setStorageSync('accessToken', access_token);
                      wx.setStorageSync('refreshToken', refresh_token);
                      accessToken = access_token;
                      refreshResolve(res.data);
                    } else {
                      refreshReject(new Error('刷新token失败'));
                    }
                  },
                  fail: (err) => {
                    refreshReject(err);
                  }
                });
              });
              
              // 刷新成功，重试所有待处理请求
              retryRequests.forEach(callback => callback());
              retryRequests = [];
              
              // 重试当前请求
              doUpload();
            } catch (refreshError) {
              // 刷新失败，清空token并提示用户重新登录
              wx.removeStorageSync('accessToken');
              wx.removeStorageSync('refreshToken');
              retryRequests.forEach(callback => callback(refreshError));
              retryRequests = [];
              
              // 提示用户重新登录
              wx.showToast({
                title: '登录已过期，请重新登录',
                icon: 'none',
                duration: 3000
              });
              
              reject(new Error('登录已过期，请重新登录'));
            } finally {
              isRefreshing = false;
            }
          } else {
            // 正在刷新token，将请求加入队列
            await new Promise((queueResolve, queueReject) => {
              retryRequests.push(() => {
                doUpload().then(queueResolve).catch(queueReject);
              });
            });
          }
        } else {
          reject(error);
        }
      }
    };
    
    doUpload();
  });
};

/**
 * 提取职位描述
 * @param {object} data - 请求数据
 * @param {string} [data.jd_text] - 职位描述文本（直接提供）
 * @param {string} [data.job_url] - 职位网址（从URL提取）
 * @returns {Promise} - 返回职位描述数据
 */
const extractJD = (data) => {
  return request('/api/extract-jd', 'POST', data);
};

/**
 * 提取简历文字（支持文件上传）
 * @param {object} options - 请求选项
 * @param {string} [options.filePath] - 简历文件路径
 * @param {string} [options.fileName] - 简历文件名
 * @param {object} [options.formData] - 表单数据
 * @returns {Promise} - 返回简历文字数据
 */
const extractResume = (options) => {
  if (options.filePath) {
    // 文件上传模式
    return uploadFile(
      '/api/extract-resume',
      options.filePath,
      'resume_file',
      options.formData || {}
    );
  } else {
    // 普通JSON请求模式
    return request('/api/extract-resume', 'POST', options.formData || {});
  }
};

/**
 * 美化简历
 * @param {object} data - 请求数据
 * @param {string} data.jd_text - 职位描述
 * @param {string} data.resume_text - 原始简历文字
 * @returns {Promise} - 返回美化后的简历
 */
const beautifyResume = (data) => {
  return request('/api/beautify-resume', 'POST', data);
};

/**
 * 生成面试话术
 * @param {object} data - 请求数据
 * @param {string} data.beautified_resume - 美化后的简历（必填）
 * @param {string} data.jd_text - 职位描述（必填）
 * @param {string} data.record_id - 记录ID（必填）
 * @returns {Promise} - 返回面试话术
 */
const generateInterview = (data) => {
  return request('/api/generate-interview', 'POST', data);
};

/**
 * 生成学习路径
 * @param {object} data - 请求数据
 * @param {string} data.jd_text - 职位描述（必填）
 * @param {string} data.beautified_resume - 美化后的简历（必填）
 * @param {string} data.record_id - 记录ID（必填）
 * @returns {Promise} - 返回学习路径
 */
const generateLearningPath = (data) => {
  return request('/api/generate-learning-path', 'POST', data);
};

/**
 * AI聊天功能
 * @param {object} data - 请求数据
 * @param {string} data.chat_message - 聊天消息
 * @returns {Promise} - 返回聊天回复
 */
const chat = (data) => {
  return request('/api/chat', 'POST', data);
};

/**
 * 获取聊天历史
 * @param {object} data - 请求数据
 * @param {string} data.session_id - 会话ID
 * @param {number} [data.limit=20] - 返回条数限制
 * @returns {Promise} - 返回聊天历史
 */
const getChatHistory = (data) => {
  return request('/api/chat/history', 'GET', data);
};

/**
 * 获取会话列表
 * @param {object} [data] - 请求数据
 * @param {number} [data.limit=50] - 返回条数限制
 * @returns {Promise} - 返回会话列表
 */
const getChatSessions = (data) => {
  return request('/api/chat/sessions', 'GET', data);
};

/**
 * 创建新会话
 * @returns {Promise} - 返回新会话信息
 */
const createNewSession = () => {
  return request('/api/chat/new-session', 'GET');
};

/**
 * 健康检查
 * @returns {Promise} - 返回健康状态
 */
const healthCheck = () => {
  return request('/health', 'GET');
};

/**
 * 上传简历文件
 * @param {object} options - 请求选项
 * @param {string} options.filePath - 简历文件路径
 * @returns {Promise} - 返回上传结果
 */
const uploadResume = (options) => {
  if (options.filePath) {
    // 文件上传模式
    return uploadFile(
      '/upload/resume',
      options.filePath,
      'file',
      options.formData || {}
    );
  } else {
    // 普通JSON请求模式（不支持）
    return Promise.reject(new Error('上传简历需要提供文件路径'));
  }
};

/**
 * 创建OCR任务
 * @param {object} data - 请求数据
 * @param {number} data.expected_count - 预期图片数量
 * @returns {Promise} - 返回任务信息
 */
const createOCRTask = (data) => {
  return request('/api/ocr/create-task', 'POST', data);
};

/**
 * 上传OCR图片
 * @param {object} options - 请求选项
 * @param {string} options.filePath - 图片文件路径
 * @param {object} options.formData - 表单数据，包含task_id和index
 * @returns {Promise} - 返回上传结果
 */
const uploadOCRImage = (options) => {
  if (options.filePath) {
    // 文件上传模式
    return uploadFile(
      '/api/ocr/upload',
      options.filePath,
      'image_file',
      options.formData || {}
    );
  } else {
    // 普通JSON请求模式（不支持）
    return Promise.reject(new Error('上传OCR图片需要提供文件路径'));
  }
};

/**
 * 获取OCR结果
 * @param {object} data - 请求数据
 * @param {string} data.task_id - 任务ID
 * @returns {Promise} - 返回OCR结果
 */
const getOCRResult = (data) => {
  return request('/api/ocr/get-result', 'GET', data);
};

/**
 * 批量分析OCR图片
 * @param {object} data - 请求数据
 * @param {string|array} data.image_paths - 图片路径（支持字符串或数组）
 * @param {number} [data.expected_count] - 多图时的预期图片数量
 * @returns {Promise} - 返回分析结果
 */
const batchAnalysis = (data) => {
  return request('/api/ocr/batch-analysis', 'POST', data);
};

// 使用CommonJS导出，适配微信小程序
module.exports = {
  extractJD,
  extractResume,
  beautifyResume,
  generateInterview,
  generateLearningPath,
  chat,
  getChatHistory,
  getChatSessions,
  createNewSession,
  healthCheck,
  uploadResume,
  createOCRTask,
  uploadOCRImage,
  getOCRResult,
  batchAnalysis
};
