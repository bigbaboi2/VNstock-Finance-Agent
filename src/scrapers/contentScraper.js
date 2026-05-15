import puppeteer from 'puppeteer';

export async function scrapeArticleContent(url) {
    let browser;
    try {
        // Mở trình duyệt Chrome ngầm (Headless)
        browser = await puppeteer.launch({
            headless: true, // Đổi thành false nếu Đại ca muốn xem nó mở tab chạy vòng vòng
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();
        
        // Giả dạng người dùng xịn
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // Truy cập URL. waitUntil: 'domcontentloaded' giúp nó đợi Google chuyển hướng xong
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });

        // Cho nó thêm 2 giây để các báo Việt Nam load xong chữ (vượt Cloudflare nếu có)
        await new Promise(r => setTimeout(r, 2000)); 

        // Chạy lệnh bóc tách dữ liệu ngay trên trình duyệt
        const fullText = await page.evaluate(() => {
            // Xóa rác
            const trash = document.querySelectorAll('script, style, iframe, header, footer, nav, aside');
            trash.forEach(el => el.remove());

            let text = '';
            
            // Chiến thuật 1: Vét thẻ p
            const paragraphs = document.querySelectorAll('p');
            paragraphs.forEach(p => {
                if (p.innerText.trim().length > 30) {
                    text += p.innerText.trim() + '\n';
                }
            });

            // Chiến thuật 2: Nếu không có p, vét theo các class bài viết phổ biến
            if (text.length < 200) {
                const contentDivs = document.querySelectorAll('.content, .detail-content, .post-content, #main-detail, .article-body, .cms-body, .detail__cmain');
                contentDivs.forEach(div => {
                    text += div.innerText.trim() + '\n';
                });
            }

            // Làm sạch khoảng trắng
            return text.replace(/\s+/g, ' ').substring(0, 3000);
        });

        await browser.close();
        
        // Nếu vẫn không cào được chữ nào thì mới báo null
        return fullText.length > 50 ? fullText : null;

    } catch (error) {
        if (browser) await browser.close();
        return null;
    }
}