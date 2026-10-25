type Review = {
  name: string;
  shop: string;
  text: string;
  usedSince: string;
};

// เพิ่มรีวิวจริงที่ได้รับอนุญาตเท่านั้น ห้ามใส่ข้อความที่สร้างขึ้นเอง
const reviews: Review[] = [];

export default function ReviewsSection() {
  if (reviews.length === 0) return null;
  return (
    <section className="max-w-5xl mx-auto px-6 py-16">
      <h2 className="text-2xl font-semibold mb-8">เสียงจากลูกค้า</h2>
      <div className="grid gap-6 md:grid-cols-2">
        {reviews.map((r, i) => (
          <figure key={i} className="rounded-2xl bg-white/5 p-6">
            <blockquote className="text-[#e6e1df]">“{r.text}”</blockquote>
            <figcaption className="mt-4 text-sm text-[#a39b97]">
              {r.name} · {r.shop} · ใช้เมล็ดมา {r.usedSince}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
