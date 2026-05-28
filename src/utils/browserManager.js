import puppeteer from 'puppeteer';
import chalk from 'chalk';

let _browser = null;
let _browserTimer = null;
let _launchingPromise = null; 

const IDLE_TIMEOUT = 3 * 60 * 1000; 

export const closeBrowser = async () => {
    if (_browser) {
        try { await _browser.close(); } catch {}
        _browser = null;
        console.log(chalk.gray('X [BrowserManager] Đã đóng Chromium để giải phóng RAM.'));
    }
};

export const getBrowser = async () => {
    
    if (_launchingPromise) {
        return await _launchingPromise;
    }

    
    if (_browser) {
        clearTimeout(_browserTimer);
        _browserTimer = setTimeout(closeBrowser, IDLE_TIMEOUT);
        try {
            await _browser.version(); 
            return _browser;
        } catch {
            _browser = null;
        }
    }

    
    console.log(chalk.yellowBright('+ [BrowserManager] Khởi động Chromium Engine dùng chung...'));
    
    
    _launchingPromise = puppeteer.launch({
        headless: 'new',
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox', 
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-zygote'
        ],
    }).then(browser => {
        _browser = browser;
        _launchingPromise = null; 
        
        clearTimeout(_browserTimer);
        _browserTimer = setTimeout(closeBrowser, IDLE_TIMEOUT);
        
        return browser;
    }).catch(err => {
        _launchingPromise = null; 
        console.error(chalk.red('[BrowserManager] Lỗi khởi động Puppeteer:'), err.message);
        return null;
    });

    
    return await _launchingPromise;
};