import './App.css'
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import Root from './layout/Root';
import { LoginPage } from './page/LoginPage';
import { SignUp } from './common/Signup';
import { MyPageLayout } from './layout/MyPageLayout';
import { StockListView } from './page/stockListPage/StockListView';
import { StockList } from './page/stockListPage/StockList';
import { CategoryList } from './page/stockListPage/CategoryList';
import { Tab1 } from './page/mypage/Tab1';
import { Tab2 } from './page/mypage/Tab2';
import { Tab3 } from './page/mypage/Tab3';
import { MyStockList } from './page/mypage/MyStockList';
import { ChangeProfile } from './page/mypage/ChangeProile';
import { MyPosts } from './page/mypage/MyPost';
import { MyComments } from './page/mypage/MyComment';
import { LikePosts } from './page/mypage/LikePost';
import { StockDetailPage } from './page/stockDetail/StockDetailPage';
import { LivingRoomPage } from './page/livingRoom/LivingRoomPage';
import { SearchingView } from './page/searchingLivingRoom/SearchingView';
import { RoomList } from './page/searchingLivingRoom/RoomsList';
import { SearchedRooms } from './page/searchingLivingRoom/SearchedRooms';

const router = createBrowserRouter([
  {
    path: '/',
    element: <Root />,
    children: [
      {index: true, element: <Navigate to='/stocks' replace />},
      {path: 'stocks', element: <StockListView />, children: [
        {index: true, element: <Navigate to='basic-list' />},
        {path:'basic-list', element:<StockList />},
        {path:'category', element: <CategoryList />}
      ]},
      {path: 'stocks/:stockCode', element: <StockDetailPage />},
      {path: 'room', element: <LivingRoomPage />},
      {path: 'room/:userId', element: <LivingRoomPage />},
      {path: 'mypage', element: <MyPageLayout />, children: [
        {index: true, element: <Navigate to='assets' replace />},
        {path: 'assets', element: <Tab1 />, children:[
          {index:true, element: <MyStockList />},
          {path: 'list', element: <MyStockList />},
          {path: 'profile', element: <ChangeProfile />}
        ]},
        {path: 'history', element: <Tab2 />},
        {path: 'community', element: <Tab3 />, children: [
          {index: true, element: <Navigate to='myPosts' />},
          {path: 'myPosts', element: <MyPosts />},
          {path: 'myComments', element: <MyComments />},
          {path: 'likes', element: <LikePosts />}
        ]}
      ]},
      {path: 'explore', element: <SearchingView />, children: [
        {index: true, element: <RoomList />},
        {path: 'basic', element: <RoomList />},
        {path: 'search', element: <SearchedRooms />}
      ]}
    ]
  },
  {path: 'login', element: <LoginPage />},
  {path: 'signup', element: <SignUp />}
])

function App() {

  return <div className='app-container'>
    <RouterProvider router={router} />
  </div>;
}

export default App
