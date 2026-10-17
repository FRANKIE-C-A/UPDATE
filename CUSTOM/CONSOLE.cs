using System;
using System.Diagnostics;
using System.Security.AccessControl;
using Console11.cs;
class Program

{
    
    static void Main()
    
    
    {
   
   //INPUT 
   Console.WriteLine("REVENUE SALES MARKET");
   Console.Write("BEVERAGE : ");
   int BeverageNumber = Convert.ToInt16(Console.ReadLine());
   Console.Write("JUNK FOODS : ");
   int JunkFoodNumber = Convert.ToInt32(Console.ReadLine());
   Console.Write("VEGETABLES : ");
   int VegeNumber = Convert.ToInt32(Console.ReadLine());
   Console.Write("MEDICINE : ");
   int MedicineNumber = Convert.ToInt32(Console.ReadLine());
   Console.Write("DESERT : ");
   int DesertNumber = Convert.ToInt32(Console.ReadLine());
   Console.ReadKey();
   Console.Clear();

   //PROCESS 

    int ToPay = (BeverageNumber * 59) + (JunkFoodNumber * 13) + (VegeNumber * 50) + (MedicineNumber * 15) + (DesertNumber * 40);
   Console.WriteLine("REVENUE SALES MARKET");
   Console.Write($"TOTAL : {ToPay} \nMONEY : ");
   int Cash = Convert.ToInt32(Console.ReadLine());
   Console.ReadKey();
   Console.Clear();

   if (Cash < ToPay)
    {
      Console.Write("YOU'RE MONEY IS NOT ENOUGH!! ");
    }
    else
    {

    Console.Write($"BEVERAGE : {BeverageNumber}\nJUNK FOOD : {JunkFoodNumber}\nVEGETABLES : {VegeNumber}\nMEDICINE : {MedicineNumber}\nDESERT : {DesertNumber}\n\n  PAID AMOUNT: {ToPay}\n\nTHANKS FOR BUYING ,COME AGAIN!!");





    }

    }
}