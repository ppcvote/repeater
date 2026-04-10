import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import NewMeeting from './pages/NewMeeting'
import MeetingResult from './pages/MeetingResult'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/meeting/new" element={<NewMeeting />} />
        <Route path="/meeting/:id" element={<MeetingResult />} />
      </Routes>
    </BrowserRouter>
  )
}
