import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import Card from '../components/Card'
import EmptyState from '../components/EmptyState'
import MiniBars from '../components/MiniBars'
import PageHeader from '../components/PageHeader'
import ProgressBar from '../components/ProgressBar'
import { useToast } from '../components/Toast'
import { db } from '../db'
import type { FoodItem, Meal, MealItem, MealSlot, ShoppingItem } from '../db/types'
import { useDateRoute } from '../hooks/useDateRoute'
import { useUndo } from '../hooks/useUndo'
import { formatCn, formatShort } from '../lib/date'
import {
  MEAL_SLOTS,
  SLOT_LABEL,
  addFood,
  addMealItem,
  addShopping,
  clearDoneShopping,
  copyMealFromYesterday,
  deleteFood,
  deleteShopping,
  getWater,
  listFoods,
  listMeals,
  listShopping,
  mealKcal,
  removeMealItem,
  restoreShopping,
  setWater,
  toggleShopping,
} from '../repo/diet'
import { listMetrics } from '../repo/fitness'
import s from './DietPage.module.css'

export default function DietPage() {
  const { date, isToday, goPrev, goNext, goToday } = useDateRoute()
  const toast = useToast()
  const undo = useUndo()

  const [shoppingText, setShoppingText] = useState('')
  const [showLibrary, setShowLibrary] = useState(false)

  const settings = useLiveQuery(() => db.settings.get('app'), [], undefined)
  const meals = useLiveQuery(() => listMeals(date), [date], [] as Meal[])
  const foods = useLiveQuery(() => listFoods(), [], [] as FoodItem[])
  const water = useLiveQuery(() => getWater(date), [date], 0)
  const shopping = useLiveQuery(() => listShopping(), [], [] as ShoppingItem[])
  const metrics = useLiveQuery(() => listMetrics(14), [], [])

  const totalKcal = meals.reduce((sum, meal) => sum + mealKcal(meal), 0)
  const target = settings?.kcalTarget ?? null

  const weightSeries = useMemo(
    () =>
      [...metrics]
        .filter((m) => typeof m.weight === 'number')
        .reverse()
        .map((m) => ({ label: formatShort(m.date), value: m.weight ?? 0 })),
    [metrics],
  )
  const latestWeight = metrics.find((m) => typeof m.weight === 'number')

  async function handleCopyYesterday(slot: MealSlot) {
    const copied = await copyMealFromYesterday(date, slot)
    if (copied === 0) {
      toast.show({ message: '昨天这一餐没有记录', tone: 'error' })
      return
    }
    toast.show({ message: `已复制昨天 ${SLOT_LABEL[slot]} 的 ${copied} 条`, tone: 'success' })
  }

  async function handleAddShopping() {
    if (!shoppingText.trim()) return
    await addShopping(shoppingText)
    setShoppingText('')
  }

  return (
    <div className="page">
      <PageHeader
        title="饮食计划"
        sub={
          isToday
            ? formatCn(date)
            : `${formatCn(date)} · 不在今天`
        }
        actions={
          <>
            <button type="button" className="btn" onClick={goPrev} aria-label="前一天">
              ←
            </button>
            <button type="button" className="btn" onClick={goToday} disabled={isToday}>
              回到今天
            </button>
            <button type="button" className="btn" onClick={goNext} aria-label="后一天">
              →
            </button>
          </>
        }
      />

      <Card>
        <div className={s.kcalRow}>
          <div>
            <p className={s.kcalLabel}>今日摄入</p>
            <p className={s.kcalValue}>
              <b className="num">{totalKcal}</b>
              <span className={s.kcalUnit}>kcal</span>
            </p>
          </div>
          <div className={s.kcalSide}>
            {target ? (
              <>
                <span className={s.kcalTarget}>目标 {target} kcal</span>
                <span
                  className={[
                    s.kcalLeft,
                    totalKcal > target ? s.kcalOver : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {totalKcal > target
                    ? `超出 ${totalKcal - target}`
                    : `还能吃 ${target - totalKcal}`}
                </span>
              </>
            ) : (
              <span className={s.kcalTarget}>还没设目标（数据与设置里可设）</span>
            )}
          </div>
        </div>
        {target ? (
          <ProgressBar
            done={totalKcal}
            total={target}
            label={`${Math.min(100, Math.round((totalKcal / target) * 100))}%`}
            color="var(--c-diet)"
          />
        ) : null}
      </Card>

      <Card
        title="喝水"
        actions={<span className={s.waterCount}>{water} / 8 杯</span>}
      >
        <div className={s.cups}>
          {Array.from({ length: 8 }, (_, i) => (
            <button
              key={i}
              type="button"
              className={[s.cup, i < water ? s.cupOn : ''].filter(Boolean).join(' ')}
              aria-label={`第 ${i + 1} 杯`}
              onClick={() => void setWater(date, water === i + 1 ? i : i + 1)}
            >
              <span className={s.cupFill} />
            </button>
          ))}
        </div>
        <p className={s.waterHint}>点杯子记录，再点一次撤回来</p>
      </Card>

      <div className={s.mealGrid}>
        {MEAL_SLOTS.map((slot) => {
          const meal = meals.find((m) => m.slot === slot)
          const safeMeal: Meal = meal ?? {
            id: `${date}-${slot}`,
            date,
            slot,
            items: [],
            createdAt: 0,
            updatedAt: 0,
            deletedAt: null,
          }
          return (
            <MealCard
              key={slot}
              meal={safeMeal}
              foods={foods}
              onCopyYesterday={() => void handleCopyYesterday(slot)}
              onAdd={async (item) => {
                await addMealItem(date, slot, item)
                await addFood({ name: item.name, kcal: item.kcal, unit: item.amount || '份' })
              }}
              onRemove={async (index) => {
                const removed = safeMeal.items[index]
                await removeMealItem(date, slot, index)
                if (!removed) return
                undo(`已删除「${removed.name}」`, async () => {
                  await addMealItem(date, slot, removed)
                })
              }}
            />
          )
        })}
      </div>

      <Card
        title="购物清单"
        actions={
          shopping.some((item) => item.done === 1) ? (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => void clearDoneShopping()}
            >
              清掉已买
            </button>
          ) : null
        }
      >
        <div className={s.shopAdd}>
          <input
            className="input"
            value={shoppingText}
            placeholder="要买什么（回车添加）"
            onChange={(e) => setShoppingText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleAddShopping()
            }}
          />
          <button type="button" className="btn" onClick={() => void handleAddShopping()}>
            添加
          </button>
        </div>

        {shopping.length === 0 ? (
          <EmptyState title="清单是空的" hint="想到什么就记一笔，去超市时照着买。" />
        ) : (
          <ul className={s.shopList}>
            {shopping.map((item) => (
              <li key={item.id} className={s.shopRow}>
                <label className={s.shopCheck}>
                  <input
                    type="checkbox"
                    checked={item.done === 1}
                    onChange={(e) => void toggleShopping(item.id, e.target.checked)}
                  />
                  <span className={item.done === 1 ? s.shopDone : ''}>{item.text}</span>
                </label>
                <button
                  type="button"
                  className={s.shopDel}
                  aria-label="删除"
                  onClick={async () => {
                    await deleteShopping(item.id)
                    undo(`已删除「${item.text}」`, async () => {
                      await restoreShopping(item.id)
                    })
                  }}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card
        title="体重（与健身共用一份）"
        actions={
          <button type="button" className="btn btn-ghost" onClick={() => setShowLibrary((v) => !v)}>
            {showLibrary ? '收起食物库' : '食物库'}
          </button>
        }
      >
        <div className={s.weightRow}>
          <div>
            <p className={s.kcalLabel}>最近一次</p>
            <p className={s.weightValue}>
              {latestWeight ? (
                <>
                  <b className="num">{latestWeight.weight}</b>
                  <span className={s.kcalUnit}>kg</span>
                  <span className={s.weightDate}>{formatShort(latestWeight.date)}</span>
                </>
              ) : (
                <span className={s.weightEmpty}>还没记过，去健身页记一笔</span>
              )}
            </p>
          </div>
          {weightSeries.length > 1 ? (
            <div className={s.weightChart}>
              <MiniBars data={weightSeries} color="var(--c-diet)" />
            </div>
          ) : null}
        </div>
        <p className={s.waterHint}>这里只读，记录和修改都在「健身计划 → 身体数据」。</p>
      </Card>

      {showLibrary ? (
        <Card title="食物库" actions={<span className={s.waterCount}>{foods.length} 种</span>}>
          {foods.length === 0 ? (
            <EmptyState
              title="还没有常用食物"
              hint="在任意一餐里加过的食物会自动进库，下次输入名字就能联想。"
            />
          ) : (
            <div className={s.foodChips}>
              {foods.map((food) => (
                <span key={food.id} className={s.foodChip}>
                  {food.name}
                  {food.kcal ? <em>{food.kcal} kcal/{food.unit}</em> : null}
                  <button
                    type="button"
                    aria-label={`删除 ${food.name}`}
                    onClick={async () => {
                      await deleteFood(food.id)
                      toast.show({ message: `已删除「${food.name}」` })
                    }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </Card>
      ) : null}
    </div>
  )
}

/* ── 单餐卡片 ─────────────────────────────────────────────────── */

interface MealCardProps {
  meal: Meal
  foods: FoodItem[]
  onAdd: (item: MealItem) => Promise<void>
  onRemove: (index: number) => Promise<void>
  onCopyYesterday: () => void
}

function MealCard({ meal, foods, onAdd, onRemove, onCopyYesterday }: MealCardProps) {
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [kcal, setKcal] = useState('')

  const calorie = mealKcal(meal)

  function fillFromLibrary(value: string) {
    setName(value)
    const match = foods.find((f) => f.name === value)
    if (match) {
      if (match.kcal !== null) setKcal(String(match.kcal))
      if (!amount) setAmount(`1 ${match.unit}`)
    }
  }

  async function submit() {
    const trimmed = name.trim()
    if (!trimmed) return
    await onAdd({
      name: trimmed,
      amount: amount.trim(),
      kcal: kcal.trim() === '' ? null : Number(kcal),
    })
    setName('')
    setAmount('')
    setKcal('')
  }

  return (
    <Card
      title={SLOT_LABEL[meal.slot]}
      className={s.mealCard}
      actions={
        <button type="button" className="btn btn-ghost" onClick={onCopyYesterday}>
          复制昨天
        </button>
      }
    >
      {meal.items.length > 0 ? (
        <ul className={s.items}>
          {meal.items.map((item, i) => (
            <li key={i} className={s.item}>
              <span className={s.itemName}>{item.name}</span>
              {item.amount ? <span className={s.itemAmount}>{item.amount}</span> : null}
              <span className={s.itemKcal}>{item.kcal === null ? '—' : `${item.kcal}`}</span>
              <button
                type="button"
                className={s.itemDel}
                aria-label={`删除 ${item.name}`}
                onClick={() => void onRemove(i)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className={s.mealEmpty}>还没记</p>
      )}

      <div className={s.addRow}>
        <input
          className={`input ${s.addName}`}
          value={name}
          list={`foods-${meal.slot}`}
          placeholder="吃了什么"
          onChange={(e) => fillFromLibrary(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit()
          }}
        />
        <input
          className={`input ${s.addAmount}`}
          value={amount}
          placeholder="份量"
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit()
          }}
        />
        <input
          className={`input ${s.addKcal}`}
          value={kcal}
          inputMode="numeric"
          placeholder="kcal"
          onChange={(e) => setKcal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit()
          }}
        />
        <button type="button" className="btn" onClick={() => void submit()}>
          加
        </button>
      </div>
      <datalist id={`foods-${meal.slot}`}>
        {foods.map((food) => (
          <option key={food.id} value={food.name}>
            {food.kcal ? `${food.kcal} kcal` : ''}
          </option>
        ))}
      </datalist>

      <p className={s.mealFoot}>{calorie > 0 ? `共 ${calorie} kcal` : '热量可以留空'}</p>
    </Card>
  )
}
