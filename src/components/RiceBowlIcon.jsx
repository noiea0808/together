import riceBowl from '../assets/rice-bowl.png'

export default function RiceBowlIcon({ size = 24, style, ...props }) {
  return (
    <img
      src={riceBowl}
      alt=""
      width={size}
      height={size}
      style={{ display: 'inline-block', verticalAlign: 'middle', objectFit: 'contain', ...style }}
      {...props}
    />
  )
}
