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
import { MyPost } from './page/mypage/MyPost';
import { MyComment } from './page/mypage/MyComment';
import { LikePost } from './page/mypage/LikePost';

const router = createBrowserRouter([
  {
    path: '/',
    element: <Root />,
    children: [
      {index: true, element: <Navigate to='/stocks' replace />},
      {path: 'stocks', element: <StockListView />, children: [
        {index: true, element: <StockList />},
        {path:'basic-list', element:<StockList />},
        {path:'category', element: <CategoryList />}
      ]},
      {path: 'mypage', element: <MyPageLayout />, children: [
        {index: true, element: <Navigate to='assets' replace />},
        {path: 'assets', element: <Tab1 />, children:[
          {index:true, element: <MyStockList />},
          {path: 'list', element: <MyStockList />},
          {path: 'profile', element: <ChangeProfile />}
        ]},
        {path: 'history', element: <Tab2 />},
        {path: 'community', element: <Tab3 />}
      ]},
      {path: 'mypage/community/myPosts', element: <MyPost />},
      {path: 'mypage/community/myComments', element: <MyComment />},
      {path: 'mypage/community/likes', element: <LikePost />}
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
