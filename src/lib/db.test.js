import { describe, it, expect, vi } from 'vitest'

// upsert는 payload에 없는 컬럼을 NULL로 취급해서, NOT NULL 컬럼(content)이 빠지면
// 충돌 처리(UPDATE) 여부와 무관하게 INSERT 시도 단계에서 바로 실패한다.
// updateWishPlaceOrder가 content를 함께 보내는지 확인하는 회귀 테스트.
const upsert = vi.fn(() => Promise.resolve({ error: null }))
const from = vi.fn(() => ({ upsert }))

vi.mock('./supabase', () => ({
  supabase: { from },
}))

const { updateWishPlaceOrder } = await import('./db')

describe('updateWishPlaceOrder', () => {
  it('upsert 페이로드에 content를 포함시킨다', async () => {
    await updateWishPlaceOrder('user-1', [
      { id: 'a', sort_order: 0, content: '첫번째 맛집' },
      { id: 'b', sort_order: 1, content: '두번째 맛집' },
    ])

    expect(from).toHaveBeenCalledWith('wish_places')
    expect(upsert).toHaveBeenCalledWith([
      { id: 'a', sort_order: 0, content: '첫번째 맛집', user_id: 'user-1' },
      { id: 'b', sort_order: 1, content: '두번째 맛집', user_id: 'user-1' },
    ])
  })

  it('orders가 비어있으면 upsert를 호출하지 않는다', async () => {
    upsert.mockClear()
    from.mockClear()
    await updateWishPlaceOrder('user-1', [])
    expect(from).not.toHaveBeenCalled()
  })
})
