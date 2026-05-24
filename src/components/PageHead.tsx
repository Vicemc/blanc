import styles from './PageHead.module.css'

interface PageHeadProps { title: string; tag: string }

export function PageHead({ title, tag }: PageHeadProps) {
  return (
    <div className={styles.head}>
      <h1 className={styles.title}>{title}</h1>
      <div className={styles.tag}>~ {tag} ~</div>
    </div>
  )
}
