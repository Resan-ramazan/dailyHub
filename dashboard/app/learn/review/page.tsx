import { CardList, Review } from "@/components/learn";
import { PageHead, Section } from "@/components/ui";
import { dueCards, readCards, readTracks } from "@/lib/learn";
import { localDate } from "@/lib/store";

export default async function ReviewPage() {
  const today = localDate();
  const [cards, tracks] = await Promise.all([readCards(), readTracks()]);
  const name = (id: string) => tracks.find((t) => t.id === id)?.name ?? id;
  const due = dueCards(cards, today).slice(0, 60);

  return (
    <>
      <PageHead eyebrow="Learn · Cards" title="Review" sub="Flip the card, then say if you knew it. Space flips, 1 = didn’t know, 2 = knew it. Up to 60 cards per session." />
      <Review cards={due.map((c) => ({ id: c.id, front: c.front, back: c.back, example: c.example, box: c.box, trackName: name(c.trackId) }))} />
      <Section n="01" title="Your deck" aside={`${cards.length} cards from your lessons and lectures`}>
        <CardList cards={[...cards].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((c) => ({ id: c.id, front: c.front, back: c.back, box: c.box, due: c.due }))} />
      </Section>
    </>
  );
}
