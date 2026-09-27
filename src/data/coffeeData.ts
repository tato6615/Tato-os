import { RoastProfile, GrindType } from '../types';

export const ASSETS = {
  // Brand Logo
  logo: '/images/IMG_2937.svg',
  // Atmospheric Highland Aerial Background
  highlandAerial: 'https://lh3.googleusercontent.com/aida-public/AB6AXuChJAtxFDi9sYCYmkD6ZiT1vbTkLIPwwwqnEW5cjSeaOjWAW6w5hR0tYd1TG2a2osutftMlVtip5VLUcaUUs987h_i9EZ1pV1uMaTTlSuBTIQ9mt-lqcrdB6Ow-I4-loGI2_gFIah8kIs66DvjKhbF75UGzWjVxxUe41-6agWu36GHoGbYfiTbLKhx-WBBw6Qnqx7lh8ras0RE1e6IqmJUFjyOmQhlQHRRjPhElxafoF5_VL187-0ys',
  // Cherries & Roasted Beans on Slate
  cherriesAndBeans: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDTkvneiKxmnYdX5NbkCXfn_7uuEDHPd8BT2Om2EzQJwp_z4TaerMDgvHVz26AK5KOlrujtwfyE37J1glIFAjZM1WAoZoiowl1TsP7d4h-Y4mt5U1fVQFzlG2U47IG_jhxs8ReKEUe3Xxr7ecbeTYzFxeEnb6H-Dym7SjAmS66b0hjH5b7WghsNvRXuQAhiLpYMf-k2cB74JidKlMdY9abT9vfugYEu9KPEw82laHXx3bximT3GlYfZ',
  // Luxury Matte Black Bag on Slate
  matteBlackPouch: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAbIzdMnw2jjWiXYz-togQEk5-N7FeBrWLzAqvXfCSjbzJCS7JOa7lqTyFUpRlXYZUjswL78ElMcj0zyHanXzz5dTopAJ5I8WXrDyfgZ3M5h6AT2MT8lOv1iDYD4pUpjidOATycTN5L_6F4Uv0-VmqS0dSVI-ROZQ35yF4TSq6VzcT4VoVK0UIVrTbiw_HWDv4gHUPjE0Pkwg8tY0vUgsvaQND3AwayyqEjpTmTPMf14E4vgYFgXQRj',
};

export const ROAST_PROFILES: RoastProfile[] = [
  {
    id: 'dark',
    name: 'DARK',
    nameThai: 'คั่วเข้ม',
    subtitle: 'เข้ม • Bold & Viscous',
    description: 'Deep roasted cocoa, toasted macadamia, bold velvety body with a dark chocolate liquor aftertaste.',
    notes: ['Dark Cocoa', 'Roasted Macadamia', 'Heavy Body'],
    intensity: 5,
    intensityMax: 5,
    intensityDisplay: '5 / 5',
    colorHex: '#392015',
    barColor: 'bg-[#ff5e1a]',
  },
  {
    id: 'medium',
    name: 'MEDIUM',
    nameThai: 'คั่วกลาง · แนะนำ',
    subtitle: 'กลาง • Sweet & Balanced',
    description: 'Caramel sweetness, stone fruit balance, sweet brown sugar notes, and a remarkably smooth honey finish.',
    notes: ['Caramel Cane', 'Ripe Stone Fruit', 'Wild Honey'],
    intensity: 3.5,
    intensityMax: 5,
    intensityDisplay: '3.5 / 5',
    colorHex: '#824424',
    barColor: 'bg-[#f3bc8b]',
    isBestseller: true,
  },
  {
    id: 'light',
    name: 'LIGHT',
    nameThai: 'คั่วอ่อน',
    subtitle: 'อ่อน • Crisp & Aromatic',
    description: 'White jasmine florals, crisp kaffir lime zest sweetness, bright lingering acidity, and clean tea-like translucence.',
    notes: ['Jasmine Flora', 'Sweet Citrus', 'Earl Grey Finish'],
    intensity: 2,
    intensityMax: 5,
    intensityDisplay: '2 / 5',
    colorHex: '#bf7c43',
    barColor: 'bg-[#ffb59c]',
  },
];

export const GRIND_OPTIONS: { id: GrindType; label: string; desc: string }[] = [
  { id: 'whole_bean', label: 'Whole Bean (เมล็ดกาแฟไม่บด)', desc: 'ดีที่สุดเพื่อคงความสดใหม่และกักเก็บกลิ่นหอม' },
  { id: 'espresso', label: 'Espresso / Moka Pot', desc: 'บดละเอียด เหมาะสำหรับเครื่องชง Espresso และ Mokapot' },
  { id: 'filter', label: 'Filter / Pour-Over / Drip', desc: 'บดปานกลาง เหมาะสำหรับดริป, V60, Chemex, Aeropress' },
  { id: 'french_press', label: 'French Press', desc: 'บดหยาบ สกัดกลิ่นหอมเข้มข้น ไม่เกิดตะกอนฝุ่น' },
  { id: 'cold_brew', label: 'Cold Brew / แช่เย็น', desc: 'บดหยาบพิเศษสำหรับการสกัดเย็น 12-24 ชั่วโมง' },
];

export const TERROIR_SPECS = [
  { label: 'Origin / แหล่งปลูก', value: 'Doi Wiang, Chiang Rai (ดอยเวียง เชียงราย)' },
  { label: 'Elevation / ความสูง', value: '1,250 MASL' },
  { label: 'Variety / สายพันธุ์', value: 'Arabica 100% (Catimor & Bourbon)' },
  { label: 'Harvest Method', value: '100% Selective Hand Pluck' },
  { label: 'Processing', value: 'Anaerobic Washed & Raised Solar Beds' },
  { label: 'Roast Schedule', value: 'Fresh Roast ทุกออเดอร์ (คั่วตามคำสั่งซื้อ)' },
];

export const SENSORY_CARDS = [
  {
    label: 'PRIMARY AROMA',
    title: 'Dark Brown Sugar & Hazelnut',
    desc: 'ความหวานเข้มข้นคล้ายน้ำตาลทรายแดงเคี่ยว ผสานกลิ่นถั่วฮาเซลนัทคั่วหอมกรุ่นเมื่อเริ่มบด',
    lineColor: 'bg-[#ff5e1a]',
  },
  {
    label: 'ACIDITY & SWEETNESS',
    title: 'Ripe Plum & Citric Touch',
    desc: 'บอดี้เนียนนุ่ม สัมผัสความเปรี้ยวหวานละมุนแบบพลัมสุกและส้มแมนดารินอ่อนๆ สดชื่นสะอาดยาวนาน',
    lineColor: 'bg-[#f3bc8b]',
  },
  {
    label: 'FINISH & TEXTURE',
    title: 'Velvety Cocoa Lingering',
    desc: 'อาฟเตอร์เทสต์ยาวนานคล้ายดาร์กช็อกโกแลต 70% ให้ความรู้สึกเต็มคำ ไม่ทิ้งรสฝาดคอ',
    lineColor: 'bg-[#ffb59c]',
  },
  {
    label: 'BREW METHOD',
    title: 'Espresso & Hand Drip',
    desc: 'สกัดได้ทั้งเครื่องชง Espresso (Ratio 1:2) หรือ Pour-over (Ratio 1:15 อุณหภูมิน้ำ 91-93°C)',
    lineColor: 'bg-[#d4c3bd]',
  },
];
