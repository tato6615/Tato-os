import { useLanguage } from '../i18n';
import { REVIEWS } from '../data/reviews';

export default function ReviewsSection() {
  const { language } = useLanguage();
  const l = language === 'th' ? 'th' : 'en';
  if (REVIEWS.length === 0) return null;
  return (
    <section className="max-w-5xl mx-auto px-6 py-16">
      <h2 className="text-2xl font-semibold mb-8">{l === 'th' ? 'เสียงจากลูกค้า' : 'What customers say'}</h2>
      <div className="grid gap-6 md:grid-cols-2">
        {REVIEWS.map((r, i) => (
          <figure key={i} className="rounded-2xl bg-white/5 p-6">
            <blockquote className="text-[#e6e1df]">“{r.text[l]}”</blockquote>
            <figcaption className="mt-4 text-sm text-[#a39b97]">
              {r.name} · {r.shop} · {l === 'th' ? 'ใช้เมล็ดมา' : 'Using our beans since'} {r.usedSince[l]}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
