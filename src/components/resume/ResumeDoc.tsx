// The one résumé template. Typeset to match a hand-made Pages résumé rather than
// the web-ish default it replaced: Times throughout, a centered header, section
// headings ruled edge to edge, a three-column role row (title · employer · dates)
// on one line, and tight bullet leading (11pt within a bullet, 14pt between).
// Every number in the stylesheet below was measured off that document.
//
// @react-pdf ships the base-14 fonts, so "Times-Roman"/"Times-Bold"/"Times-Italic"
// need no Font.register — which keeps the PDF small and the serverless cold start
// fast.

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Link,
} from "@react-pdf/renderer";
import type {
  TailoredResume,
  ResumeTrack,
  ExtraRole,
} from "@/lib/agents/resume-tailor/types";
import { parseInlineBold } from "@/lib/writing/inline-markup";
import { dateRange, trackHeader } from "@/lib/agents/resume-tailor/display";

// Text column: 612pt letter width less 34pt margins each side.
const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 36,
    paddingHorizontal: 34,
    fontSize: 10,
    fontFamily: "Times-Roman",
    color: "#000",
    lineHeight: 1.1,
  },

  name: { fontSize: 26, fontFamily: "Times-Bold", textAlign: "center", lineHeight: 1.05 },
  headline: { fontSize: 10.5, fontFamily: "Times-Italic", textAlign: "center", marginTop: 3 },
  contact: { fontSize: 8.5, textAlign: "center", marginTop: 4 },
  contactSep: { color: "#666" },

  sectionTitle: {
    fontSize: 10,
    fontFamily: "Times-Bold",
    textTransform: "uppercase",
    marginTop: 12,
    paddingBottom: 3,
    borderBottomWidth: 1,
    borderBottomColor: "#000",
  },

  // Role · employer · dates, all on one baseline. The middle cell is centered
  // rather than absolutely positioned so a long employer name still fits.
  // Equal flex on the outer cells puts the employer on the page's centre line,
  // not merely in the middle of its own cell.
  companyRow: { flexDirection: "row", alignItems: "flex-end", marginTop: 12 },
  // A section's first role sits closer to its heading than roles sit to each other.
  companyRowFirst: { marginTop: 2 },
  roleCell: { flex: 1, fontSize: 11, fontFamily: "Times-Bold" },
  companyCell: { flex: 1.2, fontSize: 11, fontFamily: "Times-Bold", textAlign: "center" },
  dateCell: { flex: 1, fontSize: 11, fontFamily: "Times-Italic", textAlign: "right" },

  // A stint's title sits left with its own dates right: without per-stint dates a
  // reader cannot tell which move came first or whether it was a promotion.
  trackRow: { flexDirection: "row", alignItems: "flex-end", marginTop: 8 },
  trackTitle: { flex: 1, fontSize: 10, fontFamily: "Times-Italic" },
  trackDates: { fontSize: 10, fontFamily: "Times-Italic", textAlign: "right" },
  // The scope line underneath: what was owned, how big, who depended on it.
  trackLine: {
    fontSize: 10,
    fontFamily: "Times-Italic",
    textAlign: "center",
    marginTop: 3,
    marginHorizontal: 18,
    lineHeight: 1.1,
  },

  // The glyph hangs into the left margin so bullet text starts at x≈36 and runs
  // the full width of the column, exactly as in the source document.
  bullet: { flexDirection: "row", marginTop: 3, marginLeft: -6 },
  bulletDot: { width: 8, fontSize: 10 },
  bulletText: { flex: 1, fontSize: 10, lineHeight: 1.1 },

  summary: { fontSize: 10.5, marginTop: 5, lineHeight: 1.2 },

  eduRow: { flexDirection: "row", alignItems: "flex-end", marginTop: 6 },
  eduLeft: { flex: 1, fontSize: 10 },
  eduRight: { fontSize: 10, textAlign: "right" },
  eduRightItalic: { fontSize: 10, fontFamily: "Times-Italic", textAlign: "right" },
  eduLine: { fontSize: 10, marginTop: 2 },

  skillRow: { flexDirection: "row", marginTop: 2, fontSize: 10 },
  skillGroup: { fontFamily: "Times-Bold", width: 90 },
  skillItems: { flex: 1 },

  link: { color: "#000", textDecoration: "none" },
});

// Render `**bold**` spans as real bold runs. Nested <Text> inherits the parent's
// size and colour and only overrides the family, which is exactly what we want.
function Rich({ children }: { children: string }) {
  const spans = parseInlineBold(children);
  if (spans.length === 1 && !spans[0].bold) return <>{spans[0].text}</>;
  return (
    <>
      {spans.map((s, i) =>
        s.bold ? (
          <Text key={i} style={{ fontFamily: "Times-Bold" }}>
            {s.text}
          </Text>
        ) : (
          <Text key={i}>{s.text}</Text>
        )
      )}
    </>
  );
}

function Bullet({ children }: { children: string }) {
  return (
    <View style={styles.bullet}>
      <Text style={styles.bulletDot}>•</Text>
      <Text style={styles.bulletText}>
        <Rich>{children}</Rich>
      </Text>
    </View>
  );
}

// The trailing colon is part of the heading in the source document; it's added
// here rather than in the data so old saved resumes pick it up too.
//
// Headings are always rendered INSIDE the unbreakable block of the first item
// they introduce, never as a standalone sibling — otherwise a section near a page
// boundary strands its heading alone at the foot of the page.
function SectionTitle({ children }: { children?: string }) {
  if (!children) return null;
  return <Text style={styles.sectionTitle}>{children}:</Text>;
}

// One line: title on the left, employer (with location) centered, dates right.
function CompanyRow({
  role,
  company,
  dates,
  first,
}: {
  role: string;
  company?: string;
  dates?: string;
  first?: boolean;
}) {
  return (
    <View style={first ? [styles.companyRow, styles.companyRowFirst] : styles.companyRow}>
      <Text style={styles.roleCell}>{role}</Text>
      <Text style={styles.companyCell}>{company || ""}</Text>
      <Text style={styles.dateCell}>{dates || ""}</Text>
    </View>
  );
}

function TrackBlock({
  track,
  entry,
  isOnlyTrack,
}: {
  track: ResumeTrack;
  entry: { role?: string; start?: string; end?: string };
  isOnlyTrack: boolean;
}) {
  // An employer with a single stint has already stated the title and dates on the
  // line above; repeating them here is noise.
  const head = trackHeader(entry, track, isOnlyTrack);
  return (
    <View wrap={false}>
      {head.show ? (
        <View style={styles.trackRow}>
          <Text style={styles.trackTitle}>{head.title}</Text>
          {head.dates ? <Text style={styles.trackDates}>{head.dates}</Text> : null}
        </View>
      ) : null}
      {track.context ? (
        <Text style={styles.trackLine}>
          <Rich>{track.context}</Rich>
        </Text>
      ) : null}
      {track.bullets.map((b, i) => (
        <Bullet key={i}>{b}</Bullet>
      ))}
    </View>
  );
}

function Contact({ resume }: { resume: TailoredResume }) {
  const parts: React.ReactNode[] = [];
  const push = (n: React.ReactNode) => {
    if (parts.length)
      parts.push(
        <Text key={`s${parts.length}`} style={styles.contactSep}>
          {"  |  "}
        </Text>
      );
    parts.push(n);
  };
  const h = resume.header;
  const bare = (u: string) => u.replace(/^https?:\/\/(www\.)?/, "");
  if (h.location) push(<Text key="loc">{h.location}</Text>);
  if (h.email)
    push(
      <Link key="em" style={styles.link} src={`mailto:${h.email}`}>
        {h.email}
      </Link>
    );
  if (h.phone) push(<Text key="ph">{h.phone}</Text>);
  if (h.links?.linkedin)
    push(
      <Link key="li" style={styles.link} src={h.links.linkedin}>
        {bare(h.links.linkedin)}
      </Link>
    );
  if (h.links?.github)
    push(
      <Link key="gh" style={styles.link} src={h.links.github}>
        {bare(h.links.github)}
      </Link>
    );
  if (h.links?.website)
    push(
      <Link key="ws" style={styles.link} src={h.links.website}>
        {bare(h.links.website)}
      </Link>
    );
  return <Text style={styles.contact}>{parts}</Text>;
}

function ExtraRoleBlock({
  role,
  first,
  heading,
}: {
  role: ExtraRole;
  first?: boolean;
  heading?: string;
}) {
  return (
    <View wrap={false}>
      <SectionTitle>{heading}</SectionTitle>
      <CompanyRow
        first={first}
        role={role.role}
        company={[role.org, role.location].filter(Boolean).join(", ")}
        dates={dateRange(role.start, role.end)}
      />
      {role.context ? (
        <Text style={styles.trackLine}>
          <Rich>{role.context}</Rich>
        </Text>
      ) : null}
      {role.bullets.map((b, i) => (
        <Bullet key={i}>{b}</Bullet>
      ))}
    </View>
  );
}

export function ResumeDoc({ resume }: { resume: TailoredResume }) {
  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.name}>{resume.header.full_name}</Text>
        {resume.header.headline ? (
          <Text style={styles.headline}>
            <Rich>{resume.header.headline}</Rich>
          </Text>
        ) : null}
        <Contact resume={resume} />

        {resume.summary ? (
          <View>
            <SectionTitle>Summary</SectionTitle>
            <Text style={styles.summary}>
              <Rich>{resume.summary}</Rich>
            </Text>
          </View>
        ) : null}

        {resume.experience.length ? (
          <View>
            {resume.experience.map((e, i) => {
              const tracks = e.tracks?.length ? e.tracks : null;
              return (
                // Only the header + first track are glued together. Keeping the
                // whole employer unbreakable would push a multi-track block like
                // a three-stint job onto a fresh page and waste half of this one.
                <View key={i}>
                  <View wrap={false}>
                    {i === 0 ? <SectionTitle>Experience</SectionTitle> : null}
                    <CompanyRow
                      first={i === 0}
                      role={e.role}
                      company={[e.company, e.location].filter(Boolean).join(", ")}
                      dates={dateRange(e.start, e.end)}
                    />
                    {tracks ? (
                      <TrackBlock track={tracks[0]} entry={e} isOnlyTrack={tracks.length === 1} />
                    ) : (
                      e.bullets.map((b, j) => <Bullet key={j}>{b}</Bullet>)
                    )}
                  </View>
                  {tracks
                    ? tracks
                        .slice(1)
                        .map((t, j) => (
                          <TrackBlock key={j} track={t} entry={e} isOnlyTrack={false} />
                        ))
                    : null}
                </View>
              );
            })}
          </View>
        ) : null}

        {resume.extras?.length ? (
          <View>
            {resume.extras.map((x, i) => (
              <View key={i}>
                {x.roles?.length ? (
                  x.roles.map((r, j) => (
                    <ExtraRoleBlock
                      key={j}
                      role={r}
                      first={j === 0}
                      heading={j === 0 ? x.heading : undefined}
                    />
                  ))
                ) : (
                  <View wrap={false}>
                    <SectionTitle>{x.heading}</SectionTitle>
                    {x.items.map((it, j) => (
                      <Bullet key={j}>{it}</Bullet>
                    ))}
                  </View>
                )}
              </View>
            ))}
          </View>
        ) : null}

        {/* Projects and Skills are no longer produced by default, but saved
            resumes from before this template still carry them. */}
        {resume.projects?.length ? (
          <View>
            {resume.projects.map((p, i) => (
              <View key={i} wrap={false}>
                {i === 0 ? <SectionTitle>Projects</SectionTitle> : null}
                <CompanyRow first={i === 0} role={p.name} />
                {p.bullets.map((b, j) => (
                  <Bullet key={j}>{b}</Bullet>
                ))}
              </View>
            ))}
          </View>
        ) : null}

        {resume.education.length ? (
          <View>
            {resume.education.map((e, i) => {
              const degree = [e.degree, e.field].filter(Boolean).join(", ");
              return (
                <View key={i} wrap={false}>
                  {i === 0 ? <SectionTitle>Education</SectionTitle> : null}
                  <View style={i === 0 ? [styles.eduRow, { marginTop: 2 }] : styles.eduRow}>
                    <Text style={[styles.eduLeft, { fontFamily: "Times-Bold" }]}>
                      {e.school}
                    </Text>
                    <Text style={styles.eduRight}>{dateRange(e.start, e.end)}</Text>
                  </View>
                  {degree || e.gpa ? (
                    <View style={styles.eduRow}>
                      <Text style={styles.eduLeft}>{degree}</Text>
                      {e.gpa ? (
                        <Text style={styles.eduRightItalic}>{`GPA: ${e.gpa}`}</Text>
                      ) : null}
                    </View>
                  ) : null}
                  {e.coursework ? (
                    <Text style={styles.eduLine}>
                      <Text style={{ fontFamily: "Times-Bold" }}>Coursework</Text>
                      {`: ${e.coursework}`}
                    </Text>
                  ) : null}
                  {e.notes?.map((n, j) => (
                    <Bullet key={j}>{n}</Bullet>
                  ))}
                </View>
              );
            })}
          </View>
        ) : null}

        {resume.skills?.length ? (
          <View wrap={false}>
            <SectionTitle>Skills</SectionTitle>
            {resume.skills.map((s, i) => (
              <View key={i} style={styles.skillRow}>
                <Text style={styles.skillGroup}>{s.group}</Text>
                <Text style={styles.skillItems}>{s.items.join(", ")}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </Page>
    </Document>
  );
}
