// 주민등록번호 뒷자리 첫 번째 숫자(성별코드) → 출생 세기 매핑.
// 1,2=1900년대生, 3,4=2000년대生, 5,6=1900년대生 외국인, 7,8=2000년대生 외국인, 9,0=1800년대生(구李)
const CENTURY_BY_GENDER_DIGIT = {
  '9': 1800, '0': 1800,
  '1': 1900, '2': 1900,
  '5': 1900, '6': 1900,
  '3': 2000, '4': 2000,
  '7': 2000, '8': 2000,
}

const MALE_DIGITS = new Set(['1', '3', '5', '7', '9'])

// 앞 6자리(YYMMDD)와 뒷자리 첫 번째 숫자만으로 실제 생년월일·성별을 계산한다.
// 나머지 뒷자리 6자리는 수집하지 않는, 다른 서비스에서도 흔히 쓰는 최소 수집 방식.
export function parseBirthId(yymmdd, genderDigit) {
  if (!/^\d{6}$/.test(yymmdd) || !/^\d$/.test(genderDigit)) return null
  const century = CENTURY_BY_GENDER_DIGIT[genderDigit]
  if (!century) return null

  const yy = Number(yymmdd.slice(0, 2))
  const mm = Number(yymmdd.slice(2, 4))
  const dd = Number(yymmdd.slice(4, 6))
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null

  const year = century + yy
  const date = new Date(year, mm - 1, dd)
  if (date.getFullYear() !== year || date.getMonth() !== mm - 1 || date.getDate() !== dd) return null
  if (date > new Date()) return null

  return {
    birthdate: `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`,
    gender: MALE_DIGITS.has(genderDigit) ? 'male' : 'female',
  }
}
