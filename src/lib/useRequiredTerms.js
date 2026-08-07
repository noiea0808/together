import { useState, useEffect, useCallback } from 'react'
import { getActiveTerms } from './db'

// 약관 로드 + 동의 상태 관리 — TermsConsentPage(재동의)와 ProfileSetupPage(최초 온보딩)가
// 각자 따로 구현했다가, 로드 실패를 "약관 없음"과 구분하지 못해 한쪽은 영원히 잠기고
// 한쪽은 필수 동의를 건너뛰는 서로 다른 문제가 생겼다. 로드 실패(loadError)를 명시적으로
// 구분해서 두 화면 모두 "실패하면 재시도만 가능, 필수 동의 없인 절대 통과 못 함"으로 통일한다.
export function useRequiredTerms() {
  const [terms, setTerms] = useState([])
  const [agreed, setAgreed] = useState({})
  const [loadingTerms, setLoadingTerms] = useState(true)
  const [loadError, setLoadError] = useState(false)

  const load = useCallback(() => {
    setLoadingTerms(true)
    setLoadError(false)
    getActiveTerms()
      .then(setTerms)
      .catch(() => setLoadError(true))
      .finally(() => setLoadingTerms(false))
  }, [])

  useEffect(() => { load() }, [load])

  const requiredTerms = terms.filter(t => t.is_required)
  const allChecked = terms.length > 0 && terms.every(t => agreed[t.id])
  const requiredAllChecked = !loadError && requiredTerms.length > 0 && requiredTerms.every(t => agreed[t.id])

  const toggleAll = () => setAgreed(allChecked ? {} : Object.fromEntries(terms.map(t => [t.id, true])))
  const toggle = (id) => setAgreed(a => ({ ...a, [id]: !a[id] }))
  const agree = (id) => setAgreed(a => ({ ...a, [id]: true }))
  const agreedList = () => terms.filter(t => agreed[t.id]).map(t => ({ id: t.id, version: t.version }))

  return {
    terms, agreed, loadingTerms, loadError, retryLoad: load,
    requiredTerms, allChecked, requiredAllChecked,
    toggleAll, toggle, agree, agreedList,
  }
}
