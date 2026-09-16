/* eslint-disable no-unused-vars */
import HomePage from '../pages/HomePage.jsx'
import RoomPage from '../pages/RoomPage.jsx'
import { useRouter } from './router.jsx'

export default function App() {
  const { roomId, initialName, navigate } = useRouter()
  return roomId ? <RoomPage roomId={roomId} initialName={initialName} /> : <HomePage onNavigate={navigate} />
}
