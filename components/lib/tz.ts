

//https://github.com/ishiko732/ts-fsrs-demo/blob/c3a6cbc6ce9be2c321e238049073b3302e6cbe34/src/lib/date.ts#L1-L31
export const currentTz = Intl.DateTimeFormat().resolvedOptions().timeZone


export function get_timezone_offset(timeZone: string): number {
  const timeZoneName = Intl.DateTimeFormat('ia', {
    timeZoneName: 'shortOffset',
    timeZone,
  })
    ?.formatToParts()
    ?.find((i) => i.type === 'timeZoneName')?.value
  if (!timeZoneName) return 0
  const offset = timeZoneName.slice(3)
  if (!offset) return 0

  const matchData = offset.match(/([+-])(\d+)(?::(\d+))?/)
  if (!matchData) throw `cannot parse timezone name: ${timeZoneName}`

  const [, sign, hour, minute] = matchData
  let result = parseInt(hour) * 60
  if (sign === '+') result *= -1
  if (minute) result += parseInt(minute)

  return result * -1
}
