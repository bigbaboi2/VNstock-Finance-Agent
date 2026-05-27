import axios from 'axios';

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Referer': 'https://s.cafef.vn/'
};

const decodeHtmlEntities = (str) => {
    return str
        .replace(/&agrave;/g, 'à').replace(/&aacute;/g, 'á').replace(/&acirc;/g, 'â').replace(/&atilde;/g, 'ã')
        .replace(/&egrave;/g, 'è').replace(/&eacute;/g, 'é').replace(/&ecirc;/g, 'ê')
        .replace(/&igrave;/g, 'ì').replace(/&iacute;/g, 'í')
        .replace(/&ograve;/g, 'ò').replace(/&oacute;/g, 'ó').replace(/&ocirc;/g, 'ô').replace(/&otilde;/g, 'õ')
        .replace(/&ugrave;/g, 'ù').replace(/&uacute;/g, 'ú').replace(/&ucirc;/g, 'û')
        .replace(/&yacute;/g, 'ý')
        .replace(/&Agrave;/g, 'À').replace(/&Aacute;/g, 'Á').replace(/&Acirc;/g, 'Â')
        .replace(/&Egrave;/g, 'È').replace(/&Eacute;/g, 'É').replace(/&Ecirc;/g, 'Ê')
        .replace(/&Ocirc;/g, 'Ô').replace(/&Uacute;/g, 'Ú')
        .replace(/&amp;/g, '&').replace(/&ndash;/g, '–').replace(/&mdash;/g, '—')
        .replace(/&ldquo;/g, '\u201C').replace(/&rdquo;/g, '\u201D')
        .replace(/&lsquo;/g, '\u2018').replace(/&rsquo;/g, '\u2019')
        .replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, '');
};

export const fetchCafefData = async (symbol) => {
    const ticker = symbol.toUpperCase();
    let logs = [];

    try {
        const [infoRes, financeRes, ownerRes, historyRes] = await Promise.all([
            axios.get(`https://cafef.vn/du-lieu/ajax/pagenew/companyinfor.ashx?symbol=${ticker}`, { headers: HEADERS, timeout: 8000 })
                 .catch(e => { logs.push(`[LỖI] Info: ${e.message}`); return null; }),
            axios.get(`https://cafef.vn/du-lieu/Ajax/PageNew/ChiSoTaiChinh.ashx?Symbol=${ticker}`, { headers: HEADERS, timeout: 8000 })
                 .catch(e => { logs.push(`[LỖI] Finance: ${e.message}`); return null; }),
            axios.get(`https://cafef.vn/du-lieu/Ajax/PageNew/CoCauSoHuu.ashx?Symbol=${ticker}`, { headers: HEADERS, timeout: 8000 })
                 .catch(e => { logs.push(`[LỖI] Ownership: ${e.message}`); return null; }),
            axios.get(`https://cafef.vn/du-lieu/Ajax/PageNew/GetCompanyHistory.ashx?Symbol=${ticker}`, { headers: HEADERS, timeout: 8000 })
                 .catch(e => { logs.push(`[LỖI] History: ${e.message}`); return null; }),
        ]);

        let mktCap = '---', pe = '---', companyName = ticker, exchange = 'VNX';
        let rawData = { info: null, finance: null, ownership: null, history: null };

        // === PARSE CAFEF INFO (basic fields) ===
        let industry = null, listingDate = null, capital = null, sharesListed = null;

        if (infoRes?.data?.Success && infoRes.data.Data) {
            rawData.info = infoRes.data.Data;
            exchange     = rawData.info.San || exchange;
            industry     = rawData.info.Nganh || null;
            listingDate  = rawData.info.NgayGDDauTien || null;
            if (rawData.info.VDL)    capital      = (rawData.info.VDL / 1_000_000_000).toFixed(0) + ' tỷ';
            if (rawData.info.KLCPNY) sharesListed = Number(rawData.info.KLCPNY).toLocaleString('vi-VN');
            logs.push(`[✅] CafeF: Đã lấy thông tin cơ bản (${exchange}).`);
        }

        // === PARSE GetCompanyHistory ===
        let address = null, phone = null, email = null, website = null, description = null;

        if (historyRes?.data?.Success && historyRes.data.Data?.historyConten) {
            const html = historyRes.data.Data.historyConten;
            rawData.history = historyRes.data.Data;

             const cleanText = (raw) => decodeHtmlEntities(
                raw.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim()
            );

             const addrMatch  = html.match(/<b>(?:Địa chỉ|Trụ sở):<\/b>\s*([^<]+)/i);
            const phoneMatch = html.match(/<b>Điện thoại:<\/b>\s*([^<]+)/i);
            const emailMatch = html.match(/mailto:([^'">\s]+)/i);
            const webMatch   = html.match(/href='(https?:\/\/[^']+)'\s*target='_blank'/i);
            if (addrMatch)  address = decodeHtmlEntities(addrMatch[1].trim());
            if (phoneMatch) phone   = decodeHtmlEntities(phoneMatch[1].trim());
            if (emailMatch) email   = emailMatch[1].trim();
            if (webMatch)   website = webMatch[1].trim();

            // --- Parse sections theo tiêu đề bold ---
             const blocks = html.split(/(?=<(?:p|div|ul)\b[^>]*>)/gi);

            const blockText = (b) => cleanText(b);

             const extractSection = (titleKeyword) => {
                let found = false;
                const content = [];
                for (const block of blocks) {
                    const text = blockText(block);
                    if (!text || text.length < 2) continue;

                     const isBoldTitle = (/<(?:b|span[^>]*font-weight:\s*bold[^>]*)>/i.test(block)) && text.length < 80;

                    if (!found) {
                        if (isBoldTitle && text.toLowerCase().includes(titleKeyword.toLowerCase())) {
                            found = true;
                        }
                    } else {
                         if (isBoldTitle && !text.toLowerCase().includes(titleKeyword.toLowerCase())) break;
                        if (text.length > 10) content.push(text);
                    }
                }
                return content.join(' ').trim();
            };

            const introText   = extractSection('Giới thiệu');
            const historyText = extractSection('Lịch sử');
            const networkText = extractSection('Mạng lưới');
            const productText = extractSection('Sản phẩm');

            const parts = [];
            if (introText)   parts.push(introText.substring(0, 500));
            if (historyText) parts.push('📌 Lịch sử hình thành:\n' + historyText.substring(0, 400));
            if (networkText) parts.push('🗺 Mạng lưới:\n' + networkText.substring(0, 250));
            if (productText) parts.push('🛠 Sản phẩm & Dịch vụ:\n' + productText.substring(0, 250));

            if (parts.length > 0) description = parts.join('\n\n');

            logs.push(`[✅] CafeF: Lấy được profile công ty (địa chỉ, mô tả, lịch sử).`);
        }

        // === PARSE CAFEF FINANCE (vốn hóa, P/E) ===
        if (financeRes?.data?.Success && Array.isArray(financeRes.data.Data)) {
            rawData.finance = financeRes.data.Data;
            const capItem = rawData.finance.find(item => item.Code === 'VonHoaThiTruong');
            if (capItem?.Value) mktCap = capItem.Value + ' Tỷ';
            const peItem = rawData.finance.find(item => item.Code === 'P/E');
            if (peItem?.Value) pe = peItem.Value;
            logs.push(`[✅] CafeF: Đã lấy Vốn hóa (${mktCap}) & P/E (${pe}).`);
        }

        if (ownerRes?.data) {
            rawData.ownership = ownerRes.data.Data || ownerRes.data;
            logs.push(`[✅] CafeF: Đã lấy fulldata Cơ cấu sở hữu.`);
        }

        // === BUILD OVERVIEW STRING ===
        const overview = [
            industry     ? `🏭 Ngành: ${industry}`                          : null,
            listingDate  ? `📅 GDĐT: ${listingDate}`                         : null,
            capital      ? `💰 Vốn điều lệ: ${capital}`                      : null,
            sharesListed ? `📊 CP niêm yết: ${sharesListed}`                 : null,
            address      ? `📍 ${address}`                                   : null,
            phone        ? `📞 ${phone}`                                     : null,
            email        ? `✉️ ${email}`                                     : null,
            website      ? `🌐 ${website}`                                   : null,
            description  ? description                                       : null,
        ].filter(Boolean).join('\n');

        return {
            success: true,
            rawData,
            mktCap,
            pe,
            companyName,
            exchange,
            overview,
            logs,
            profileData: { industry, listingDate, capital, sharesListed, address, phone, email, website, description }
        };

    } catch (error) {
        return { success: false, logs: [`[LỖI] CafeF Service: ${error.message}`] };
    }
};