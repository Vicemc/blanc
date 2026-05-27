import { useSettings } from '../lib/settings'
import styles from './PageHead.module.css'

interface PageHeadProps { title: string; tag: string; pageId?: string }

export function PageHead({ title, tag, pageId }: PageHeadProps) {
  const { isTaglineHidden } = useSettings()
  const hidden = pageId ? isTaglineHidden(pageId) : false
  return (
    <div className={styles.head}>
      <h1 className={styles.title}>{title}</h1>
      {!hidden && <div className={styles.tag}>~ {tag} ~</div>}
    </div>
  )
}
