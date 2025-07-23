/**
 * 错误处理模块
 * 提供统一的错误处理和用户反馈机制
 */

import * as utils from './utils.js';

class ErrorHandler {
    constructor() {
        this.errorLog = [];
        this.maxLogSize = 100;
        this.setupGlobalErrorHandling();
    }

    /**
     * 设置全局错误处理
     */
    setupGlobalErrorHandling() {
        window.addEventListener('error', (event) => {
            this.logError({
                type: 'JavaScript Error',
                message: event.message,
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno,
                stack: event.error?.stack
            });
        });

        window.addEventListener('unhandledrejection', (event) => {
            this.logError({
                type: 'Unhandled Promise Rejection',
                message: event.reason?.message || event.reason,
                stack: event.reason?.stack
            });
        });
    }

    /**
     * 记录错误
     */
    logError(errorInfo) {
        const errorEntry = {
            ...errorInfo,
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
            url: window.location.href
        };

        this.errorLog.unshift(errorEntry);
        
        if (this.errorLog.length > this.maxLogSize) {
            this.errorLog = this.errorLog.slice(0, this.maxLogSize);
        }

        console.error('Error logged:', errorEntry);
    }

    /**
     * 显示用户友好的错误提示
     */
    showUserError(message, details = null, options = {}) {
        const {
            duration = 5000,
            type = 'error',
            actionButton = null
        } = options;

        // 创建更详细的错误提示
        const errorToast = document.createElement('div');
        errorToast.className = `error-toast error-toast-${type}`;
        errorToast.innerHTML = `
            <div class="error-toast-content">
                <div class="error-toast-message">${this.escapeHtml(message)}</div>
                ${details ? `<div class="error-toast-details">${this.escapeHtml(details)}</div>` : ''}
                ${actionButton ? `<button class="error-toast-action">${actionButton.text}</button>` : ''}
            </div>
            <button class="error-toast-close">×</button>
        `;

        // 添加到页面
        document.body.appendChild(errorToast);

        // 绑定事件
        const closeBtn = errorToast.querySelector('.error-toast-close');
        closeBtn.addEventListener('click', () => this.removeToast(errorToast));

        if (actionButton) {
            const actionBtn = errorToast.querySelector('.error-toast-action');
            actionBtn.addEventListener('click', () => {
                actionButton.onClick();
                this.removeToast(errorToast);
            });
        }

        // 自动关闭
        if (duration > 0) {
            setTimeout(() => this.removeToast(errorToast), duration);
        }

        // 添加到错误日志
        this.logError({
            type: 'User Error',
            message,
            details
        });
    }

    /**
     * 处理API错误
     */
    handleApiError(error, context = '') {
        let userMessage = '请求失败，请稍后重试';
        let details = null;

        if (error.name === 'AbortError') {
            userMessage = '请求已取消';
        } else if (error.response) {
            const status = error.response.status;
            switch (status) {
                case 400:
                    userMessage = '请求参数错误';
                    details = error.response.data?.error || '请检查输入内容';
                    break;
                case 401:
                    userMessage = 'API密钥无效或已过期';
                    details = '请检查API密钥设置';
                    break;
                case 403:
                    userMessage = '访问被拒绝';
                    details = '请检查API权限设置';
                    break;
                case 429:
                    userMessage = '请求过于频繁';
                    details = '请稍后再试';
                    break;
                case 500:
                case 502:
                case 503:
                    userMessage = '服务器暂时不可用';
                    details = '请稍后重试';
                    break;
                default:
                    userMessage = `请求失败 (${status})`;
                    details = error.response.data?.error || error.message;
            }
        } else if (error.request) {
            userMessage = '网络连接失败';
            details = '请检查网络连接后重试';
        } else {
            userMessage = '发生未知错误';
            details = error.message;
        }

        this.showUserError(userMessage, details, {
            actionButton: error.response?.status === 401 ? {
                text: '设置API密钥',
                onClick: () => {
                    // 触发显示设置页面
                    document.dispatchEvent(new CustomEvent('showSettings'));
                }
            } : null
        });
    }

    /**
     * 获取错误日志
     */
    getErrorLog() {
        return [...this.errorLog];
    }

    /**
     * 导出错误日志
     */
    exportErrorLog() {
        const logData = JSON.stringify(this.errorLog, null, 2);
        const blob = new Blob([logData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `error-log-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    /**
     * 移除提示
     */
    removeToast(toast) {
        if (toast && toast.parentNode) {
            toast.classList.add('fade-out');
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }
    }

    /**
     * HTML转义
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// 创建全局实例
export const errorHandler = new ErrorHandler();

// 快捷方法
export const showError = (message, details, options) => 
    errorHandler.showUserError(message, details, options);

export const handleApiError = (error, context) => 
    errorHandler.handleApiError(error, context);