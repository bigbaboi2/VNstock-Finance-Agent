import puppeteer from 'puppeteer';

export async function scrapeArticleContent(url) {
    let browser;
    try {
        // Mở trình duyệt Chrome ngầm (Headless)
        browser = await puppeteer.launch({
            headless: true, 
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();
        
        // Human behavior
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });

        await new Promise(r => setTimeout(r, 2000)); 

        const fullText = await page.evaluate(() => {
            // Xóa rác
            const trash = document.querySelectorAll('script, style, iframe, header, footer, nav, aside');
            trash.forEach(el => el.remove());

            let text = '';
            
            const paragraphs = document.querySelectorAll('p');
            paragraphs.forEach(p => {
                if (p.innerText.trim().length > 30) {
                    text += p.innerText.trim() + '\n';
                }
            });

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
        
        return fullText.length > 50 ? fullText : null;

    } catch (error) {
        if (browser) await browser.close();
        return null;
    }
}