import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Link,
} from "@react-pdf/renderer";
import type { TailoredResume } from "@/lib/agents/resume-tailor/types";

const styles = StyleSheet.create({
  page: { paddingTop: 36, paddingBottom: 36, paddingHorizontal: 44, fontSize: 10, fontFamily: "Helvetica", color: "#1a1a1a", lineHeight: 1.35 },
  name: { fontSize: 18, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  headline: { fontSize: 10.5, color: "#444", marginBottom: 4 },
  contact: { fontSize: 9, color: "#555", marginBottom: 12 },
  contactSep: { color: "#aaa" },
  sectionTitle: { fontSize: 10, fontFamily: "Helvetica-Bold", letterSpacing: 1.2, textTransform: "uppercase", marginTop: 10, marginBottom: 4, borderBottomWidth: 0.6, borderBottomColor: "#999", paddingBottom: 2 },
  itemHeader: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  role: { fontSize: 10.5, fontFamily: "Helvetica-Bold" },
  company: { fontSize: 10, color: "#333" },
  meta: { fontSize: 9, color: "#666" },
  bullet: { flexDirection: "row", marginTop: 2 },
  bulletDot: { width: 9, fontSize: 10 },
  bulletText: { flex: 1, fontSize: 10 },
  summary: { fontSize: 10.5, marginBottom: 2 },
  skillRow: { flexDirection: "row", marginTop: 2, fontSize: 10 },
  skillGroup: { fontFamily: "Helvetica-Bold", width: 90 },
  skillItems: { flex: 1 },
  link: { color: "#1a1a1a", textDecoration: "none" },
});

function Contact({ resume }: { resume: TailoredResume }) {
  const parts: React.ReactNode[] = [];
  const push = (n: React.ReactNode) => {
    if (parts.length) parts.push(<Text key={`s${parts.length}`} style={styles.contactSep}>  ·  </Text>);
    parts.push(n);
  };
  const h = resume.header;
  if (h.location) push(<Text key="loc">{h.location}</Text>);
  if (h.email) push(<Link key="em" style={styles.link} src={`mailto:${h.email}`}>{h.email}</Link>);
  if (h.phone) push(<Text key="ph">{h.phone}</Text>);
  if (h.links?.linkedin) push(<Link key="li" style={styles.link} src={h.links.linkedin}>{h.links.linkedin.replace(/^https?:\/\/(www\.)?/, "")}</Link>);
  if (h.links?.github) push(<Link key="gh" style={styles.link} src={h.links.github}>{h.links.github.replace(/^https?:\/\/(www\.)?/, "")}</Link>);
  if (h.links?.website) push(<Link key="ws" style={styles.link} src={h.links.website}>{h.links.website.replace(/^https?:\/\/(www\.)?/, "")}</Link>);
  return <Text style={styles.contact}>{parts}</Text>;
}

export function ResumeDoc({ resume }: { resume: TailoredResume }) {
  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.name}>{resume.header.full_name}</Text>
        {resume.header.headline ? <Text style={styles.headline}>{resume.header.headline}</Text> : null}
        <Contact resume={resume} />

        {resume.summary ? (
          <View>
            <Text style={styles.sectionTitle}>Summary</Text>
            <Text style={styles.summary}>{resume.summary}</Text>
          </View>
        ) : null}

        {resume.experience.length ? (
          <View>
            <Text style={styles.sectionTitle}>Experience</Text>
            {resume.experience.map((e, i) => (
              <View key={i} wrap={false}>
                <View style={styles.itemHeader}>
                  <Text style={styles.role}>{e.role}</Text>
                  <Text style={styles.meta}>{[e.start, e.end].filter(Boolean).join(" – ")}</Text>
                </View>
                <View style={styles.itemHeader}>
                  <Text style={styles.company}>{[e.company, e.location].filter(Boolean).join(", ")}</Text>
                </View>
                {e.bullets.map((b, j) => (
                  <View key={j} style={styles.bullet}>
                    <Text style={styles.bulletDot}>•</Text>
                    <Text style={styles.bulletText}>{b}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        ) : null}

        {resume.projects?.length ? (
          <View>
            <Text style={styles.sectionTitle}>Projects</Text>
            {resume.projects.map((p, i) => (
              <View key={i} wrap={false}>
                <View style={styles.itemHeader}>
                  <Text style={styles.role}>
                    {p.link ? <Link style={styles.link} src={p.link}>{p.name}</Link> : p.name}
                  </Text>
                </View>
                {p.bullets.map((b, j) => (
                  <View key={j} style={styles.bullet}>
                    <Text style={styles.bulletDot}>•</Text>
                    <Text style={styles.bulletText}>{b}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        ) : null}

        {resume.education.length ? (
          <View>
            <Text style={styles.sectionTitle}>Education</Text>
            {resume.education.map((e, i) => (
              <View key={i} wrap={false}>
                <View style={styles.itemHeader}>
                  <Text style={styles.role}>{e.school}</Text>
                  <Text style={styles.meta}>{[e.start, e.end].filter(Boolean).join(" – ")}</Text>
                </View>
                <Text style={styles.company}>{[e.degree, e.field].filter(Boolean).join(", ")}</Text>
                {e.notes?.map((n, j) => (
                  <View key={j} style={styles.bullet}>
                    <Text style={styles.bulletDot}>•</Text>
                    <Text style={styles.bulletText}>{n}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        ) : null}

        {resume.skills?.length ? (
          <View>
            <Text style={styles.sectionTitle}>Skills</Text>
            {resume.skills.map((s, i) => (
              <View key={i} style={styles.skillRow}>
                <Text style={styles.skillGroup}>{s.group}</Text>
                <Text style={styles.skillItems}>{s.items.join(", ")}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {resume.extras?.length ? (
          <View>
            {resume.extras.map((x, i) => (
              <View key={i}>
                <Text style={styles.sectionTitle}>{x.heading}</Text>
                {x.items.map((it, j) => (
                  <View key={j} style={styles.bullet}>
                    <Text style={styles.bulletDot}>•</Text>
                    <Text style={styles.bulletText}>{it}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        ) : null}
      </Page>
    </Document>
  );
}
